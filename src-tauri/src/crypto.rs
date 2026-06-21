//! Couche de chiffrement E2E.
//!
//! On garde deux paires de clés bien distinctes : l'identité libp2p (ed25519)
//! sert uniquement au transport et au PeerId, tandis que cette paire X25519 est
//! ce qui chiffre réellement le contenu des messages. Les séparer évite que le
//! format de nos messages dépende des internes de libp2p.

use crypto_box::{
    aead::{generic_array::GenericArray, Aead, AeadCore},
    PublicKey, SalsaBox, SecretKey,
};
use rand::rngs::OsRng;
use sha2::{Digest, Sha256};

/// Chiffre `plaintext` pour `their_public`. Renvoie (ciphertext, nonce).
/// Le nonce est aléatoire à chaque appel — c'est ce qui rend XSalsa20 sûr.
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

/// Déchiffre. Renvoie None si l'authentification Poly1305 échoue : message
/// altéré, mauvaise clé, ou tentative d'injection.
pub fn open(my_secret: &SecretKey, their_public: &PublicKey, nonce: &[u8; 24], ct: &[u8]) -> Option<Vec<u8>> {
    let b = SalsaBox::new(their_public, my_secret);
    let n = GenericArray::clone_from_slice(nonce);
    b.decrypt(&n, ct).ok()
}

/// Empreinte lisible d'une clé publique. Deux utilisateurs la comparent par un
/// canal de confiance pour écarter toute attaque de l'homme du milieu.
/// Format : 8 blocs de 4 caractères hexa, ex. `A1B2 C3D4 ...`.
pub fn fingerprint(pubkey: &[u8; 32]) -> String {
    let digest = Sha256::digest(pubkey);
    digest[..16]
        .chunks(2)
        .map(|c| format!("{:02X}{:02X}", c[0], c[1]))
        .collect::<Vec<_>>()
        .join(" ")
}
