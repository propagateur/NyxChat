use crypto_box::{
    aead::{generic_array::GenericArray, Aead, AeadCore},
    PublicKey, SalsaBox, SecretKey,
};
use rand::rngs::OsRng;
use sha2::{Digest, Sha256};

pub fn seal(my_secret: &SecretKey, their_public: &PublicKey, plaintext: &[u8]) -> (Vec<u8>, [u8; 24]) {
    let b = SalsaBox::new(their_public, my_secret);
    let nonce = SalsaBox::generate_nonce(&mut OsRng);
    let ct = b
        .encrypt(&nonce, plaintext)
        .expect("XSalsa20-Poly1305 ne peut pas échouer sur une entrée valide");

    let mut n = [0u8; 24];
    n.copy_from_slice(nonce.as_slice());
    (ct, n)
}

pub fn open(my_secret: &SecretKey, their_public: &PublicKey, nonce: &[u8; 24], ct: &[u8]) -> Option<Vec<u8>> {
    let b = SalsaBox::new(their_public, my_secret);
    let n = GenericArray::clone_from_slice(nonce);
    b.decrypt(&n, ct).ok()
}

pub fn hex(bytes: &[u8; 32]) -> String {
    let mut s = String::with_capacity(64);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

pub fn fingerprint(pubkey: &[u8; 32]) -> String {
    let digest = Sha256::digest(pubkey);
    digest[..16]
        .chunks(2)
        .map(|c| format!("{:02X}{:02X}", c[0], c[1]))
        .collect::<Vec<_>>()
        .join(" ")
}
