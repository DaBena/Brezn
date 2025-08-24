use ring::rand::{SecureRandom, SystemRandom};
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
use anyhow::{Result, anyhow};

pub struct CryptoManager {
    key: LessSafeKey,
    rand: SystemRandom,
}

impl CryptoManager {
    pub fn new() -> Result<Self> {
        let rand = SystemRandom::new();
        
        // Generate a random key for this session
        let mut key_bytes = [0u8; 32];
        rand.fill(&mut key_bytes)
            .map_err(|_| anyhow!("Failed to generate key"))?;
        
        let unbound_key = UnboundKey::new(&AES_256_GCM, &key_bytes)
            .map_err(|_| anyhow!("Failed to create key"))?;
        
        let key = LessSafeKey::new(unbound_key);
        
        Ok(Self { key, rand })
    }
    
    pub fn encrypt(&self, data: &[u8]) -> Result<Vec<u8>> {
        let mut nonce_bytes = [0u8; 12];
        self.rand.fill(&mut nonce_bytes)
            .map_err(|_| anyhow!("Failed to generate nonce"))?;
        
        let nonce = Nonce::assume_unique_for_key(nonce_bytes);
        
        let mut in_out = data.to_vec();
        self.key.seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
            .map_err(|_| anyhow!("Encryption failed"))?;
        
        // Prepend nonce to ciphertext
        let mut result = nonce_bytes.to_vec();
        result.extend(in_out);
        
        Ok(result)
    }
    
    pub fn decrypt(&self, data: &[u8]) -> Result<Vec<u8>> {
        if data.len() < 12 {
            return Err(anyhow!("Invalid ciphertext"));
        }
        
        let (nonce_bytes, ciphertext) = data.split_at(12);
        let nonce = Nonce::assume_unique_for_key(
            nonce_bytes.try_into()
                .map_err(|_| anyhow!("Invalid nonce"))?
        );
        
        let mut in_out = ciphertext.to_vec();
        self.key.open_in_place(nonce, Aad::empty(), &mut in_out)
            .map_err(|_| anyhow!("Decryption failed"))?;
        
        // Remove tag
        in_out.truncate(in_out.len() - 16);
        
        Ok(in_out)
    }
}