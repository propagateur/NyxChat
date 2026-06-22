# NyxChat

**Messagerie pair-à-pair, chiffrée de bout en bout — application de bureau.**

NyxChat est une messagerie sans serveur central et sans compte : ton identité
n'est qu'une paire de clés sur ta machine. Sur un même réseau local les pairs se
découvrent tout seuls ; à distance, on s'ajoute par une adresse **`.onion`** et
tout passe par **Tor**. Ni un attaquant sur le réseau, ni une quelconque
infrastructure, ne peuvent lire ce qui transite.

Construit avec **Tauri** pour rester léger et natif sur le bureau.

---

## Fonctionnalités

-  Chiffrement de bout en bout (X25519 + XSalsa20-Poly1305)
-  Découverte automatique des pairs sur le réseau local (mDNS, libp2p)
-  Joignable depuis n'importe où via **services onion Tor** (ajout par `.onion`, QR)
-  Transfert de fichiers chiffré (avec aperçu d'images)
-  Messages vocaux
-  Appels audio et vidéo (WebRTC, signalisation chiffrée, STUN)
-  Vérification d'identité par empreinte de clé (« safety number »)
-  Thèmes clair/sombre + couleurs d'accent
-  Palette de commandes (Ctrl-K), emoji, glisser-déposer, markdown léger
-  Épingler / couper le son des conversations, contacts vérifiés
-  Icône dans la zone de notification (reste joignable en arrière-plan)
-  Aucun historique écrit sur le disque par défaut

---

## Comment ça marche

```
┌──────────────── Tauri (Rust) ────────────────┐      ┌─────────── React / TS ───────────┐
│  net.rs    swarm libp2p (mDNS, Noise, yamux)  │ IPC  │  Rail · Accueil · Messages        │
│  tornet.rs transport Tor (services onion)     │◄────►│  Réseau · Réglages · Appel        │
│  crypto.rs X25519 + XSalsa20-Poly1305         │event │  (api.ts : invoke / listen)       │
└────────────────────────────────────────────────┘      └───────────────────────────────────┘
```

Chaque pair possède **deux clés** : une identité **ed25519** (le `PeerId` libp2p,
pour le transport) et une paire **X25519** qui chiffre réellement le contenu.
À la rencontre, les pairs s'échangent leur clé publique X25519 (message `Hello`) ;
ensuite chaque message est scellé avec `crypto_box` et n'est lisible que par le
destinataire. Les fichiers suivent le même chemin, découpés en morceaux de 256 Ko
chacun chiffré séparément.

Les **appels** utilisent le moteur WebRTC du webview : le flux audio/vidéo va en
direct entre les deux pairs, seule la signalisation (SDP/ICE) passe par le canal
chiffré. Aucun serveur de signalisation.

L'**empreinte** affichée près de chaque pair est un SHA-256 de sa clé publique :
la comparer de visu écarte toute attaque de l'homme du milieu.

---

## Portée réseau

- **Réseau local** : découverte automatique (mDNS), connexion directe.
- **Internet** : services onion Tor — tu partages ton adresse `.onion`, ton
  correspondant colle la sienne, et vous discutez où que vous soyez, sans ouvrir
  de port ni dépendre d'un serveur. Le réseau Tor fait office d'infrastructure
  partagée (et ne voit pas le contenu chiffré).
- **Appels** : conçus pour le réseau local + STUN pour traverser la plupart des
  box domestiques (le média WebRTC/UDP ne transite pas par Tor).

---

## Sécurité

Le chiffrement repose sur des primitives éprouvées (les mêmes que
NaCl/libsodium). Ce projet **n'a pas fait l'objet d'un audit de sécurité
formel** — à utiliser pour apprendre et expérimenter, pas pour protéger des
secrets critiques.

---

## Développement

Prérequis : **Rust** (stable, https://rustup.rs) et **Node.js** 18+.

```bash
# 1. récupérer le binaire Tor embarqué (Windows)
powershell -ExecutionPolicy Bypass -File scripts/fetch-tor.ps1

# 2. installer les dépendances front
npm install

# 3. lancer en développement
npm run tauri dev

# 4. construire un installeur natif
npm run tauri build
```

Le premier build compile toute la pile libp2p/Tauri : comptez quelques minutes.
Pour tester le P2P, lancez NyxChat sur **deux machines** (même réseau local, ou
échange d'adresses `.onion` à distance).

---

## Stack

Rust · Tauri · React · libp2p · Tor · WebRTC · TypeScript · Vite

## Licence

MIT — voir [LICENSE](LICENSE).

*Créateur — développement full-stack (Rust & React), 2025.*
