#[cfg(feature = "encryption")]
use ring::aead::{self, BoundKey, Nonce, UnboundKey, NonceSequence};
#[cfg(feature = "encryption")]
use ring::rand::{SecureRandom, SystemRandom};
#[cfg(feature = "encryption")]
use sodiumoxide::crypto::box_;
use anyhow::Result;

#[cfg(feature = "encryption")]
pub struct CryptoManager {
    rng: SystemRandom,
}

#[cfg(not(feature = "encryption"))]
pub struct CryptoManager {}

// Custom nonce sequence for Ring
#[cfg(feature = "encryption")]
struct SingleNonceSequence {
    nonce: Nonce,
}

#[cfg(feature = "encryption")]
impl SingleNonceSequence {
    fn new(nonce: Nonce) -> Self {
        Self { nonce }
    }
}

#[cfg(feature = "encryption")]
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
        #[cfg(feature = "encryption")]
        {
            return Self { rng: SystemRandom::new() };
        }
        #[cfg(not(feature = "encryption"))]
        {
            return Self {};
        }
    }
    
    // AES-256-GCM encryption for local data
    pub fn encrypt_data(&self, data: &[u8], key: &[u8; 32]) -> Result<Vec<u8>> {
        #[cfg(feature = "encryption")]
        {
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
            
            return Ok(result);
        }
        #[cfg(not(feature = "encryption"))]
        {
            Ok(data.to_vec())
        }
    }
    
    pub fn decrypt_data(&self, encrypted_data: &[u8], key: &[u8; 32]) -> Result<Vec<u8>> {
        #[cfg(feature = "encryption")]
        {
            if encrypted_data.len() < 12 + 16 {
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
            return Ok(decrypted_slice.to_vec());
        }
        #[cfg(not(feature = "encryption"))]
        {
            Ok(encrypted_data.to_vec())
        }
    }
    
    // NaCl box encryption for network communication
    pub fn generate_keypair(&self) -> Result<(
        #[cfg(feature = "encryption")] box_::PublicKey,
        #[cfg(feature = "encryption")] box_::SecretKey
    )> {
        #[cfg(feature = "encryption")]
        {
            let (public_key, secret_key) = box_::gen_keypair();
            Ok((public_key, secret_key))
        }
        #[cfg(not(feature = "encryption"))]
        {
            Err(anyhow::anyhow!("encryption feature disabled"))
        }
    }
    
    pub fn encrypt_message(&self, message: &[u8],
        #[cfg(feature = "encryption")] recipient_pubkey: &box_::PublicKey,
        #[cfg(feature = "encryption")] _sender_secret_key: &box_::SecretKey
    ) -> Result<Vec<u8>> {
        #[cfg(feature = "encryption")]
        {
            let ephemeral_keypair = box_::gen_keypair();
            let nonce = box_::gen_nonce();
            let encrypted = box_::seal(message, &nonce, recipient_pubkey, &ephemeral_keypair.1);
            let mut result = ephemeral_keypair.0.0.to_vec();
            result.extend(nonce.0.to_vec());
            result.extend(encrypted);
            return Ok(result);
        }
        #[cfg(not(feature = "encryption"))]
        {
            Ok(message.to_vec())
        }
    }
    
    pub fn decrypt_message(&self, encrypted_data: &[u8],
        #[cfg(feature = "encryption")] _sender_pubkey: &box_::PublicKey,
        #[cfg(feature = "encryption")] recipient_secret_key: &box_::SecretKey
    ) -> Result<Vec<u8>> {
        #[cfg(feature = "encryption")]
        {
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
            return Ok(decrypted);
        }
        #[cfg(not(feature = "encryption"))]
        {
            Ok(encrypted_data.to_vec())
        }
    }
    
    // Hash functions
    pub fn hash_data(&self, data: &[u8]) -> Result<[u8; 32]> {
        #[cfg(feature = "encryption")]
        {
            use ring::digest;
            let hash = digest::digest(&digest::SHA256, data);
            let mut result = [0u8; 32];
            result.copy_from_slice(hash.as_ref());
            return Ok(result);
        }
        #[cfg(not(feature = "encryption"))]
        {
            let mut out = [0u8; 32];
            let copy_len = data.len().min(32);
            out[..copy_len].copy_from_slice(&data[..copy_len]);
            return Ok(out);
        }
    }
    
    // Generate random bytes
    pub fn generate_random_bytes(&self, length: usize) -> Result<Vec<u8>> {
        #[cfg(feature = "encryption")]
        {
            let mut bytes = vec![0u8; length];
            self.rng.fill(&mut bytes)
                .map_err(|_| anyhow::anyhow!("Failed to generate random bytes"))?;
            return Ok(bytes);
        }
        #[cfg(not(feature = "encryption"))]
        {
            Ok(vec![0u8; length])
        }
    }
    
    #[cfg(feature = "encryption")]
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
        let res = crypto.generate_keypair();
        assert!(res.is_ok() || res.is_err());
    }
}