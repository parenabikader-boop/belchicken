# Contrat d'échange entre l'application Belchicken et l'application Livraison

Version 1 — 16 octobre 2026 — document de travail (plan 5, étape 1). Rien n'est encore construit.

## En deux mots

Aujourd'hui, la livraison se fait **à l'intérieur** de l'application Belchicken. Demain, notre équipe de livraison
aura **sa propre application** (sa propre adresse, son hébergement, sa base de données). Les deux applications
se parleront en s'envoyant de courts messages :

- **Belchicken envoie une course** : « voici une commande à livrer, à tel endroit, à tel prix ».
- **La Livraison répond à chaque étape** : « livreur choisi », « commande récupérée », « livrée », « frais encaissés ».

Ce document dit **quels messages**, **ce qu'ils contiennent**, **comment ils sont protégés**, et **ce qui se passe
en cas de panne**. Il est écrit pour être lu par Belchicken comme par l'équipe technique ; les détails techniques
sont à la fin (annexes).

Principes :

1. **Belchicken reste maître de la commande** : les plats, le paiement du repas, le prix de la livraison. La
   Livraison ne voit jamais le détail des plats ni le montant du repas, et ne change jamais le prix.
2. **La Livraison est maître de la course** : quel livreur, quand il récupère, quand il livre, ce qu'il encaisse.
3. **Le moins possible de données personnelles** circulent, et elles sont effacées dès qu'elles ne servent plus.
4. **Rien ne se perd** : chaque message est réessayé jusqu'à ce qu'il soit reçu, et n'est jamais traité deux fois.
5. **Plusieurs restaurants** dès le départ : Belchicken est le premier ; d'autres pourront suivre sans rien refaire.

## 1. Ce que Belchicken envoie

### 1.1 Nouvelle course

Envoyée quand la commande part en préparation (paiement du repas vérifié), pour que le responsable livraison
puisse choisir un livreur à l'avance.

| Information | Exemple | Pourquoi |
|---|---|---|
| Restaurant | `belchicken-kamsonghin` | savoir de quel restaurant vient la course |
| Référence de la commande | `BC-7K2Q9M` | la même des deux côtés, pour s'y retrouver |
| Heure de la commande | 16/10/2026 12:03 | délais du relevé |
| Prénom du client | Awa | le livreur sait qui demander |
| Téléphone du client | +226 70 12 34 56 | le livreur peut l'appeler |
| Position (GPS) | 12.3700, -1.5300 (précision 30 m) | itinéraire |
| Quartier et repères | « Gounghin, porte bleue après la pharmacie » | trouver la maison |
| Frais de livraison | 1 400 F (déjà fixés, acceptés par le client) | ce que le livreur encaisse |
| Origine du prix | « par km, 4,2 km par la route » | relevé, contestation |
| Frais déjà payés ? | non | savoir s'il faut encaisser |
| Livraison offerte ? | non (0 F = rien à encaisser) | idem |
| Code de livraison | 4 chiffres | voir ci-dessous |
| Nombre d'articles | 3 | vérifier le sac |
| Note pour le livreur | « sonner deux fois » | facultatif |

**Jamais envoyés** : le détail des plats et leurs prix, le montant du repas, le mode de paiement du repas, le nom de
famille, l'agent du call center.

**Le code de livraison** est envoyé pour que l'application Livraison puisse le vérifier quand le livreur le tape.
Comme aujourd'hui, il n'est **jamais affiché au livreur** : il est seulement comparé par le serveur, et bloqué après
5 codes faux.

### 1.2 Mises à jour d'une course

| Message | Quand | Effet côté Livraison |
|---|---|---|
| **Prête** | la cuisine a fini le sac (« Prête pour livraison ») | le livreur est prévenu de venir |
| **Modifiée** | repères ou téléphone corrigés par le call center ; frais corrigés par le Patron (avec motif) | la course est mise à jour, le livreur prévenu |
| **Annulée** | la commande est annulée (motif obligatoire) | la course disparaît ; si le livreur l'a déjà, il est prévenu de ne pas livrer |

Le **prix ne change jamais côté Livraison**. S'il doit changer, c'est Belchicken qui envoie « Modifiée », avec le
motif, avant que les frais soient encaissés.

## 2. Ce que la Livraison renvoie

| Message | Contenu | Effet côté Belchicken |
|---|---|---|
| **Reçue** | — | la course est bien arrivée (sinon Belchicken réessaie) |
| **Attribuée** | nom du livreur, son téléphone | affiché au call center ; plus tard, au client (« Appeler le livreur ») |
| **Livreur retiré** | motif | la course attend un autre livreur |
| **Récupérée** | heure ; « confirmée à la place du livreur » + motif si besoin | la commande passe « En livraison » ; le client est prévenu |
| **En route** | (facultatif) position approximative du livreur | suivi du client, plus tard |
| **Livrée** | heure ; code du client correct | la commande passe « Livrée » ; le client est remercié |
| **Livrée sans code** | heure, motif obligatoire, qui a validé | « Livrée », signalée à part (comme aujourd'hui) |
| **Frais encaissés** | montant, en espèces ou par mobile money | caisse et relevé de livraison |
| **Problème** | client injoignable, adresse introuvable, accident… + texte | alerte au call center, qui décide (rappeler, annuler) |

La Livraison **ne peut pas annuler** une commande : elle signale un problème, et c'est Belchicken qui annule
(motif obligatoire, comme aujourd'hui).

## 3. Sécurité

- **Connexion chiffrée** (HTTPS) uniquement.
- **Chaque message est signé** avec une clé secrète propre à chaque restaurant (une pour Belchicken, une autre pour
  un futur restaurant). Un message sans la bonne signature, ou trop vieux (plus de 5 minutes), est refusé.
- **Chaque message a un numéro unique** : reçu deux fois (par exemple après un réessai), il n'est traité **qu'une
  seule fois**.
- **Ordre des étapes respecté** : une étape arrivée en retard (par exemple « Récupérée » après « Livrée ») est notée
  mais ne fait jamais revenir la commande en arrière.
- **Données personnelles minimales** : prénom, téléphone, position et repères seulement, pour la durée de la course.
  Côté Livraison, ils sont **effacés 30 jours après la livraison** (le relevé garde la référence, le quartier, les
  heures et les montants des frais, jamais le téléphone ni la position).
- **Clés gardées hors du code**, dans les réglages des hébergeurs, changeables à tout moment (une ancienne et une
  nouvelle clé peuvent fonctionner ensemble quelques jours, le temps du changement).
- **Journal** des messages reçus et envoyés des deux côtés (sans les données personnelles), pour régler un désaccord.

## 4. En cas de panne

### Si l'application Livraison est en panne

- Belchicken **garde les courses** et réessaie tout seul : après 1 min, 5 min, 15 min, puis toutes les heures,
  pendant 24 h.
- Après **5 minutes sans réponse** pour une course, le call center et le Patron reçoivent une alerte : « Livraison
  injoignable ». Ils appellent le responsable livraison par téléphone (procédure de secours sur papier).
- En cas de longue panne, le Prestataire peut repasser Belchicken en **mode Restaurant** (un interrupteur) : les
  livreurs du restaurant reprennent avec l'application Belchicken, comme aujourd'hui.

### Si l'application Belchicken est en panne

- La Livraison **continue les courses déjà reçues** (le livreur a l'adresse, le code se vérifie chez elle).
- Les étapes (« Livrée », « Frais encaissés »…) sont **gardées et renvoyées** dès que Belchicken répond.
- Aucune nouvelle course ne peut arriver : le call center appelle le responsable livraison (procédure de secours).

### Si les deux ne sont plus d'accord

- Chaque jour, une **comparaison automatique** des courses du jour (référence, étape, frais) signale les écarts au
  Prestataire et au Patron.
- En cas de désaccord, le journal des messages signés fait foi.

## 5. Plusieurs restaurants

- Chaque restaurant a **son identifiant**, **sa clé secrète**, **son contrat** (prix par livraison, forfait…) et
  **sa grille de prix** (fixée par le restaurant, comme Belchicken aujourd'hui).
- Une course est reconnue par **restaurant + référence** : deux restaurants peuvent avoir la même référence sans
  confusion.
- Un restaurant ne voit **que ses courses** ; nos livreurs peuvent livrer pour plusieurs restaurants.
- Le relevé de livraison se fait **par restaurant**.

## 6. Passage par étapes (rappel du plan 5)

1. **Ce contrat** (ce document) — à valider avec Belchicken.
2. Construction de l'application Livraison, sans rien brancher.
3. Double fonctionnement pendant 1 à 2 semaines : Belchicken envoie les courses aux deux, on compare.
4. Bascule : les livreurs et le responsable livraison passent sur la nouvelle application (interrupteur, retour
   possible).
5. Autres restaurants.

## 7. Questions à valider avec Belchicken

- [ ] La liste des informations envoyées (section 1.1) vous convient-elle ? Faut-il le nom de famille ?
- [ ] Durée de conservation des données personnelles côté Livraison : 30 jours ?
- [ ] Délai avant l'alerte « Livraison injoignable » : 5 minutes ?
- [ ] Qui décide en cas de « Problème » signalé par le livreur : le call center ?
- [ ] Le numéro du livreur peut-il être montré au client ?

---

## Annexe A — Détails techniques

### Adresses

- Belchicken → Livraison : `POST https://<adresse-livraison>/api/v1/restaurants/{restaurant}/courses/evenements`
- Livraison → Belchicken : `POST https://<adresse-belchicken>/api/livraison/v1/evenements`
- Comparaison du jour (lecture seule, des deux côtés) : `GET …/api/v1/restaurants/{restaurant}/courses?jour=2026-10-16`

### Enveloppe commune de chaque message

```json
{
  "version": 1,
  "id": "evt_01JAB3K7Q9X2M4N6P8R0T2V4X6",
  "type": "COURSE_CREEE",
  "restaurant": "belchicken-kamsonghin",
  "reference": "BC-7K2Q9M",
  "sequence": 3,
  "at": "2026-10-16T12:03:00Z",
  "data": { }
}
```

- `id` : unique (ULID). Le destinataire garde les `id` reçus au moins 7 jours ; un `id` déjà vu reçoit la même
  réponse qu'au premier passage, sans rien refaire.
- `sequence` : numéro croissant par course et par expéditeur ; un message plus ancien que le dernier traité est
  noté, jamais appliqué à rebours.
- Réponse attendue : `200` (traité ou déjà traité), `4xx` (refusé, inutile de réessayer, alerte), `5xx` ou pas de
  réponse (réessayer).

### Signature

En-têtes de chaque message :

```
X-Livraison-Horodatage: 1760616180          (secondes, heure UTC)
X-Livraison-Signature: v1=<HMAC-SHA256 hexadécimal>
X-Livraison-Cle: k2026a                      (quelle clé, pour pouvoir en changer)
```

Signature = HMAC-SHA256(clé secrète du restaurant, `horodatage + "." + corps du message tel quel`). Refus si la
signature ne correspond pas (comparaison à temps constant) ou si l'horodatage a plus de 5 minutes d'écart.

### Types de messages

Belchicken → Livraison : `COURSE_CREEE`, `COURSE_PRETE`, `COURSE_MODIFIEE`, `COURSE_ANNULEE`.

Livraison → Belchicken : `COURSE_RECUE`, `LIVREUR_ATTRIBUE`, `LIVREUR_RETIRE`, `COURSE_RECUPEREE`, `EN_ROUTE`,
`LIVREE`, `LIVREE_SANS_CODE`, `FRAIS_ENCAISSES`, `PROBLEME`.

### Exemple : `COURSE_CREEE`

```json
{
  "client": { "prenom": "Awa", "telephone": "+22670123456" },
  "position": { "latitude": 12.37, "longitude": -1.53, "precisionM": 30 },
  "adresse": { "quartier": "Gounghin", "reperes": "porte bleue après la pharmacie" },
  "frais": { "montant": 1400, "origine": "KM_ROUTE", "distanceM": 4200, "dejaPayes": false },
  "codeLivraison": "0427",
  "articles": 3,
  "note": null,
  "commandeLe": "2026-10-16T12:03:00Z"
}
```

### Exemple : `FRAIS_ENCAISSES`

```json
{ "montant": 1400, "mode": "ESPECES", "livreur": { "nom": "Rasmané", "telephone": "+22670970009" }, "at": "2026-10-16T12:51:00Z" }
```

### Correspondance avec les étapes actuelles de Belchicken

| Belchicken aujourd'hui | Message |
|---|---|
| `EN_PREPARATION` (mode Prestataire) | `COURSE_CREEE` |
| `PRETE_LIVRAISON` | `COURSE_PRETE` |
| `ANNULEE` | `COURSE_ANNULEE` |
| livreur choisi par le Responsable livraison | `LIVREUR_ATTRIBUE` |
| « Commande récupérée » → `EN_LIVRAISON` | `COURSE_RECUPEREE` |
| remise avec le code → `LIVREE` | `LIVREE` |
| remise sans code (motif) → `LIVREE` | `LIVREE_SANS_CODE` |
| frais payés au livreur (espèces / mobile money) | `FRAIS_ENCAISSES` |

### Réessais

1 min, 5 min, 15 min, puis toutes les heures pendant 24 h ; ensuite, alerte au Prestataire et au Patron, et le
message reste dans la file jusqu'à une relance manuelle. Les messages d'une même course partent dans l'ordre.
