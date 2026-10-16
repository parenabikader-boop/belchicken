// Plan 2 : formats des SMS de paiement reçus par le téléphone marchand ECOFOOD, un par opérateur. DONNÉES SEULEMENT :
// le lecteur (payment-sms.js) ne contient aucun texte d'opérateur. Pour ajouter ou corriger un format : modifier ce
// fichier, ou mettre la liste complète, au même format JSON, dans la variable Render SMS_PAIEMENT_FORMATS (elle passe
// avant ce fichier). Page Prestataire, « Tester un SMS » : vérifier qu'un vrai SMS est bien lu, sans rien valider.
//
// ATTENTION : ces exemples sont SUPPOSÉS (supposed: true) en attendant les vrais SMS du téléphone marchand. Un format
// supposé n'est jamais utilisé pour valider une commande : ses SMS sont seulement notés dans le journal (« ILLISIBLE »
// ou reconnus sans validation), et la commande reste à vérifier par le call center. Mettre supposed: false une fois
// le format vérifié sur de vrais SMS.
//
// Formats d'ESSAI (trial: true) : vérifiés sur de vrais SMS, mais pas ceux du téléphone marchand (par exemple un
// transfert reçu sur un téléphone personnel, pour un premier essai). Ils ne comptent que si l'interrupteur « Formats
// SMS d'essai » est ouvert (page Prestataire) : fermé, ils sont ignorés, comme s'ils n'étaient pas dans ce fichier.
// Pour les retirer pour de bon : supprimer leur bloc. Plusieurs formats peuvent avoir le même expéditeur : le premier
// qui reconnaît un paiement reçu est utilisé.
//
// Chaque format :
//   trial     facultatif : format d'essai (voir plus haut)
//   operator  ORANGE_MONEY | MOOV_MONEY | TELECEL_MONEY (moyen de paiement choisi par le client)
//   senders   expéditeurs officiels acceptés (majuscules, espaces et tirets ignorés)
//   must      expression qui doit se trouver dans le SMS (preuve d'un paiement REÇU)
//   reject    facultatif : expression qui écarte le SMS (paiement envoyé, retrait, échec…)
//   amount    expression dont la 1re parenthèse donne le montant reçu
//   phone     expression dont la 1re parenthèse donne le numéro qui a payé
//   txid      facultatif : expression dont la 1re parenthèse donne le n° de transaction
//   example   un SMS du format, pour les tests et la page Prestataire
// Les expressions ignorent les majuscules et les accents ne sont pas retirés (écrire [ée] au besoin).
export const DEFAULT_SMS_FORMATS = [
  // Essai du 16 octobre 2026 : vrai SMS « transfert reçu » d'Orange Money Burkina (expéditeur « OrangeMoney »), reçu sur
  // un téléphone personnel. Montants « 101.0 » ou « 15,000.00 » (point décimal, virgule des milliers), numéro du payeur
  // sur 8 chiffres, « Trans ID: … ». Le transfert ENVOYÉ (« vous avez transfere ») est écarté.
  {
    operator: 'ORANGE_MONEY',
    label: 'Orange Money · transfert reçu (essai)',
    trial: true,
    senders: ['OrangeMoney', 'Orange Money'],
    must: 'vous avez re[çc]u\\s+\\d[\\d.,]*\\s*FCFA',
    reject: '(?:transf[ée]r[ée]|envoy[ée]|retrait|[ée]chec|annul)',
    amount: 'vous avez re[çc]u\\s+(\\d[\\d.,]*)\\s*FCFA',
    phone: '\\bdu\\s+((?:\\+?226)?\\d{8})\\b',
    txid: '(?:Trans\\s*ID|ID\\s*Trans)\\s*:?\\s*([A-Z0-9][A-Z0-9.]{4,})',
    example: 'Vous avez recu 101.0 FCFA, Frais: FCFA, Taxe:  FCFA du 07516439,XXX. Le solde de votre compte est de 1234.567 FCFA Trans ID: PP261016.1647.95770711. Flashez le QR CODE marchand avec Max it pour plus de facilite : https://onelink.to/nn64xw',
  },
  {
    operator: 'ORANGE_MONEY',
    label: 'Orange Money',
    supposed: true,
    senders: ['OrangeMoney', 'Orange Money', 'ORANGE'],
    must: 're[çc]u',
    reject: '(?:vous avez envoy|vous avez transf[ée]r|retrait|[ée]chec|annul)',
    amount: 're[çc]u\\s+(?:un\\s+paiement\\s+de\\s+)?(\\d[\\d\\s.,]*)\\s*(?:F\\s?CFA|FCFA|XOF|F)\\b',
    phone: '(?:du|de|par)\\s+(?:num[ée]ro\\s+)?((?:\\+?226)?\\s?\\d{2}\\s?\\d{2}\\s?\\d{2}\\s?\\d{2})\\b',
    txid: '(?:Trans(?:action)?\\s*ID|ID\\s*Trans(?:action)?|R[ée]f(?:[ée]rence)?)\\s*[:.]?\\s*([A-Z0-9][A-Z0-9.\\-]{4,})',
    example: 'Vous avez recu un paiement de 7000 FCFA du 70123456 (AWA OUEDRAOGO). Trans ID: PP241016.1530.A12345. Nouveau solde: 150000 FCFA.',
  },
  {
    operator: 'MOOV_MONEY',
    label: 'Moov Money',
    supposed: true,
    senders: ['MoovMoney', 'Moov Money', 'MOOV', 'Flooz'],
    must: 're[çc]u',
    reject: '(?:vous avez envoy|vous avez transf[ée]r|retrait|[ée]chec|annul)',
    amount: '(\\d[\\d\\s.,]*)\\s*(?:F\\s?CFA|FCFA|XOF)\\b',
    phone: 're[çc]u\\s+(?:de|du)\\s+((?:\\+?226)?\\s?\\d{2}\\s?\\d{2}\\s?\\d{2}\\s?\\d{2})\\b',
    txid: '(?:R[ée]f(?:[ée]rence)?|Trans(?:action)?\\s*ID|ID)\\s*[:.]?\\s*([A-Z0-9][A-Z0-9.\\-]{4,})',
    example: 'Paiement recu de 22660123456 : 7000 FCFA. Ref: MP241016.1530.B1234. Nouveau solde 150000 FCFA',
  },
  {
    operator: 'TELECEL_MONEY',
    label: 'Telecel Money',
    supposed: true,
    senders: ['TelecelMoney', 'Telecel Money', 'TELECEL'],
    must: 're[çc]u',
    reject: '(?:vous avez envoy|vous avez transf[ée]r|retrait|[ée]chec|annul)',
    amount: 're[çc]u\\s+(?:un\\s+paiement\\s+de\\s+)?(\\d[\\d\\s.,]*)\\s*(?:F\\s?CFA|FCFA|XOF|F)\\b',
    phone: '(?:du|de|par)\\s+((?:\\+?226)?\\s?\\d{2}\\s?\\d{2}\\s?\\d{2}\\s?\\d{2})\\b',
    txid: '(?:ID|R[ée]f(?:[ée]rence)?|Trans(?:action)?\\s*ID)\\s*[:.]?\\s*([A-Z0-9][A-Z0-9.\\-]{4,})',
    example: 'Vous avez recu un paiement de 7 000 F de 58123456. ID: TLC2410161530. Solde: 150 000 F.',
  },
];
