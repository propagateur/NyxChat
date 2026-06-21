# NyxChat

**Messagerie P2P chiffrée de bout en bout — application de bureau.**

NyxChat est une messagerie entièrement pair-à-pair, sans serveur central. Deux
instances sur le même réseau se découvrent toutes seules et échangent des
messages chiffrés de bout en bout : ni un attaquant sur le réseau, ni
l'infrastructure, ne peuvent lire ce qui transite.

Construit avec **Tauri** pour rester léger et natif sur les trois plateformes
desktop.

---

## État du projet

- ✅ Découverte automatique des pairs sur le réseau local (mDNS)
- ✅ Connexion directe pair-à-pair via libp2p (TCP + Noise + Yamux)
- ✅ Chiffrement de bout en bout (X25519 + XSalsa20-Poly1305)
- ✅ Transfert de fichiers chiffré (découpé en morceaux, chacun chiffré)
- ✅ Appels audio et vidéo (WebRTC, signalisation chiffrée via libp2p, STUN)
- ✅ Vérification d'identité par empreinte de clé publique
- ✅ Identité persistante (même empreinte d'une session à l'autre)
- ✅ Aucun historique de messages écrit sur le disque (rien à saisir a posteriori)

**Portée réseau.** La découverte et les conversations sont pensées pour le réseau
local. Les **appels** utilisent un serveur STUN public pour traverser la plupart
des box/routeurs domestiques (le média reste P2P ; un TURN peut être ajouté pour
les NAT symétriques). Étendre la *messagerie* à l'Internet ouvert demanderait un
nœud relais libp2p — volontairement hors périmètre pour rester sans serveur.

---

## Prérequis

Deux outils à installer :

1. **Rust** (édition stable) — https://rustup.rs
2. **Node.js** 18+ — https://nodejs.org

Sous Windows, WebView2 est déjà présent sur Windows 10/11 récents.

## Lancer en développement

```bash
npm install
npm run tauri dev
```

Le premier lancement compile tout libp2p : comptez quelques minutes. Les
suivants sont quasi instantanés.

Pour tester le P2P, lancez NyxChat sur **deux machines du même réseau local**
(ou deux comptes / VM). Elles se découvrent automatiquement et apparaissent dans
la liste des pairs.

## Construire un binaire natif

```bash
npm run tauri build
```

---

## Comment ça marche

```
┌──────────── Tauri (Rust) ────────────┐        ┌──────────── React ───────────┐
│  net.rs                               │        │  api.ts   (invoke / listen)   │
│   └─ swarm libp2p (tâche async)       │  IPC   │  App.tsx  (état des fils)     │
│       mDNS · request-response · Noise │◄──────►│  Sidebar / Chat               │
│  crypto.rs                            │ events │                               │
│   └─ X25519 + XSalsa20-Poly1305       │        │                               │
└───────────────────────────────────────┘        └───────────────────────────────┘
```

Chaque pair possède **deux clés** :

- une identité **ed25519** (le `PeerId` libp2p, pour le transport) ;
- une paire **X25519** qui chiffre réellement le contenu des messages.

Quand deux pairs se rencontrent, ils s'échangent leur clé publique X25519 (le
message `Hello`). À partir de là, chaque message est scellé avec
`crypto_box` (XSalsa20-Poly1305) et n'est déchiffrable que par le destinataire.

Les fichiers suivent le même chemin : découpés en morceaux de 256 Ko, chacun
chiffré séparément, envoyés puis réassemblés et enregistrés dans Téléchargements.

Les **appels** utilisent le moteur WebRTC du webview pour le média (le flux
audio/vidéo va en direct entre les deux pairs). Seule la *signalisation* —
l'échange des descriptions SDP et des candidats ICE — passe par notre canal
libp2p, elle aussi chiffrée de bout en bout. En clair : aucun serveur de
signalisation, et le contenu de l'appel ne transite par rien d'autre que les
deux machines.

> Caméra/micro : au premier appel, Windows peut demander l'autorisation d'accès.
> Vérifie aussi que les apps de bureau ont le droit d'utiliser la caméra/le
> micro dans les *Paramètres → Confidentialité*.

L'**empreinte** affichée à côté de chaque pair est un hachage SHA-256 de sa clé
publique. La comparer de visu avec son interlocuteur garantit l'absence
d'attaque de l'homme du milieu — c'est le même principe que le « safety number »
de Signal.

---

## Note de sécurité

Le chiffrement repose sur des primitives éprouvées (les mêmes que NaCl/libsodium),
mais ce projet **n'a pas fait l'objet d'un audit de sécurité formel**. À utiliser
pour apprendre, expérimenter et bricoler — pas pour protéger des secrets d'État.

---

## Régénérer les icônes

Le logo est dans `src-tauri/icons/`. Pour tout regénérer à partir de la source :

```bash
npm run tauri icon src-tauri/icons/icon-source.png
```

---

## Stack

Rust · Tauri · React · libp2p · WebRTC · TypeScript · Vite

## Licence

MIT — voir [LICENSE](LICENSE).

*Créateur — développement full-stack (Rust & React), 2025.*
