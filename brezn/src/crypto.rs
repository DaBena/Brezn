use ring::aead::{self, BoundKey, Nonce, UnboundKey, NonceSequence};
use ring::rand::{SecureRandom, SystemRandom};
use sodiumoxide::crypto::box_;
use anyhow::Result;

pub struct CryptoManager {
    rng: SystemRandom,
}

// Custom nonce sequence for Ring
struct SingleNonceSequence {
    nonce: Nonce,
}

impl SingleNonceSequence {
    fn new(nonce: Nonce) -> Self {
        Self { nonce }
    }
}

impl NonceSequence for SingleNonceSequence {
    fn advance(&mut self) -> std::result::Result<Nonce, ring::error::Unspecified> {
        // Create a new nonce with the same bytes
        let nonce_bytes = self.nonce.as_ref();
        let mut new_nonce_array = [0u8; 12];
        new_nonce_array.copy_from_slice(&nonce_bytes[0..12]);
        let new_nonce = Nonce::assume_unique_for_key(new_nonce_array);
        Ok(new_nonce)
    }
}

impl CryptoManager {
    pub fn new() -> Self {
        Self {
            rng: SystemRandom::new(),
        }
    }
    
    // AES-256-GCM encryption for local data
    pub fn encrypt_data(&self, data: &[u8], key: &[u8; 32]) -> Result<Vec<u8>> {
        let nonce_bytes = self.generate_nonce()?;
        let nonce = Nonce::assume_unique_for_key(nonce_bytes);
        let nonce_sequence = SingleNonceSequence::new(nonce);
        
        let unbound_key = UnboundKey::new(&aead::AES_256_GCM, key)
            .map_err(|_| anyhow::anyhow!("Failed to create encryption key"))?;
        
        let mut sealing_key = aead::SealingKey::new(unbound_key, nonce_sequence);
        let mut encrypted = data.to_vec();
        
        sealing_key.seal_in_place_append_tag(aead::Aad::empty(), &mut encrypted)
            .map_err(|_| anyhow::anyhow!("Failed to encrypt data"))?;
        
        // Prepend nonce to encrypted data
        let mut result = nonce_bytes.to_vec();
        result.extend(encrypted);
        
        Ok(result)
    }
    
    pub fn decrypt_data(&self, encrypted_data: &[u8], key: &[u8; 32]) -> Result<Vec<u8>> {
        if encrypted_data.len() < 12 + 16 { // nonce + minimum encrypted data
            return Err(anyhow::anyhow!("Invalid encrypted data length"));
        }
        
        let (nonce_bytes, ciphertext) = encrypted_data.split_at(12);
        let mut nonce_array = [0u8; 12];
        nonce_array.copy_from_slice(nonce_bytes);
        let nonce = Nonce::assume_unique_for_key(nonce_array);
        let nonce_sequence = SingleNonceSequence::new(nonce);
        
        let unbound_key = UnboundKey::new(&aead::AES_256_GCM, key)
            .map_err(|_| anyhow::anyhow!("Failed to create decryption key"))?;
        
        let mut opening_key = aead::OpeningKey::new(unbound_key, nonce_sequence);
        let mut decrypted = ciphertext.to_vec();
        
        let decrypted_slice = opening_key.open_in_place(aead::Aad::empty(), &mut decrypted)
            .map_err(|_| anyhow::anyhow!("Failed to decrypt data"))?;
        
        Ok(decrypted_slice.to_vec())
    }
    
    // NaCl box encryption for network communication
    pub fn generate_keypair(&self) -> Result<(box_::PublicKey, box_::SecretKey)> {
        let (public_key, secret_key) = box_::gen_keypair();
        Ok((public_key, secret_key))
    }
    
    pub fn encrypt_message(&self, message: &[u8], recipient_pubkey: &box_::PublicKey, _sender_secret_key: &box_::SecretKey) -> Result<Vec<u8>> {
        let ephemeral_keypair = box_::gen_keypair();
        let nonce = box_::gen_nonce();
        
        let encrypted = box_::seal(message, &nonce, recipient_pubkey, &ephemeral_keypair.1);
        
        // Combine ephemeral public key, nonce, and encrypted data
        let mut result = ephemeral_keypair.0.0.to_vec();
        result.extend(nonce.0.to_vec());
        result.extend(encrypted);
        
        Ok(result)
    }
    
    pub fn decrypt_message(&self, encrypted_data: &[u8], _sender_pubkey: &box_::PublicKey, recipient_secret_key: &box_::SecretKey) -> Result<Vec<u8>> {
        if encrypted_data.len() < box_::PUBLICKEYBYTES + box_::NONCEBYTES {
            return Err(anyhow::anyhow!("Invalid encrypted data length"));
        }
        
        let (ephemeral_pubkey_bytes, rest) = encrypted_data.split_at(box_::PUBLICKEYBYTES);
        let (nonce_bytes, ciphertext) = rest.split_at(box_::NONCEBYTES);
        
        let ephemeral_pubkey = box_::PublicKey::from_slice(ephemeral_pubkey_bytes)
            .ok_or_else(|| anyhow::anyhow!("Failed to parse ephemeral public key"))?;
        let nonce = box_::Nonce::from_slice(nonce_bytes)
            .ok_or_else(|| anyhow::anyhow!("Failed to parse nonce"))?;
        
        let decrypted = box_::open(ciphertext, &nonce, &ephemeral_pubkey, recipient_secret_key)
            .map_err(|_| anyhow::anyhow!("Failed to decrypt message"))?;
        
        Ok(decrypted)
    }
    
    // Hash functions
    pub fn hash_data(&self, data: &[u8]) -> Result<[u8; 32]> {
        use ring::digest;
        
        let hash = digest::digest(&digest::SHA256, data);
        let mut result = [0u8; 32];
        result.copy_from_slice(hash.as_ref());
        
        Ok(result)
    }
    
    // Generate random bytes
    pub fn generate_random_bytes(&self, length: usize) -> Result<Vec<u8>> {
        let mut bytes = vec![0u8; length];
        self.rng.fill(&mut bytes)
            .map_err(|_| anyhow::anyhow!("Failed to generate random bytes"))?;
        
        Ok(bytes)
    }
    
    fn generate_nonce(&self) -> Result<[u8; 12]> {
        let mut nonce = [0u8; 12];
        self.rng
            .fill(&mut nonce)
            .map_err(|_| anyhow::anyhow!("Failed to generate nonce"))?;
        Ok(nonce)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_encryption_decryption() {
        let crypto = CryptoManager::new();
        let key = [1u8; 32];
        let data = b"Hello, World!";
        
        let encrypted = crypto.encrypt_data(data, &key).unwrap();
        let decrypted = crypto.decrypt_data(&encrypted, &key).unwrap();
        
        assert_eq!(data, decrypted.as_slice());
    }
    
    #[test]
    fn test_nacl_encryption() {
        let crypto = CryptoManager::new();
        let (alice_pub, alice_sec) = crypto.generate_keypair().unwrap();
        let (bob_pub, bob_sec) = crypto.generate_keypair().unwrap();
        
        let message = b"Secret message";
        let encrypted = crypto.encrypt_message(message, &bob_pub, &alice_sec).unwrap();
        let decrypted = crypto.decrypt_message(&encrypted, &alice_pub, &bob_sec).unwrap();
        
        assert_eq!(message, decrypted.as_slice());
    }
}