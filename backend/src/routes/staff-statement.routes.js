import { Router } from 'express';
import { requireStaff } from '../middlewares/staff-auth.js';
import { featureClosedError, isFeatureOpen } from '../services/features.service.js';
import { requestMeta } from '../services/security-log.service.js';
import { createTerms, deleteTerms, getStatement, getTerms } from '../services/statement.service.js';
import { statementFileName, statementWorkbook } from '../services/statement-excel.js';
import { termsSchema } from '../services/statement.js';

// Lot 5d : relevé de notre équipe de livraison (/api/staff/releve).
//   - Relevé et Excel : Prestataire (tout), Responsable livraison (sans conditions ni montant dû, retirés par
//     le serveur), Patron en lecture seule si le Prestataire a ouvert RELEVE.
//   - Conditions du contrat : lues par le Prestataire et le Patron (RELEVE ouvert), jamais par le Responsable
//     livraison ; ajoutées ou supprimées par le Prestataire seulement.
export const staffStatementRouter = Router();
staffStatementRouter.use(requireStaff('PATRON', 'RESPONSABLE_LIVRAISON')); // + Prestataire (accessFor)

// Le Patron ne voit le relevé que si le Prestataire a ouvert RELEVE (fermé sans ligne, features.js)
staffStatementRouter.use(async (req, res, next) => {
  try {
    if (req.staff.role === 'PATRON' && !(await isFeatureOpen('RELEVE'))) return next(featureClosedError());
    next();
  } catch (e) {
    next(e);
  }
});

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

const period = (req) => ({ du: String(req.query.du || ''), au: String(req.query.au || '') });

staffStatementRouter.get('/', handle(async (req, res) => {
  res.json({ statement: await getStatement(req.staff, period(req)) });
}));

staffStatementRouter.get('/excel', handle(async (req, res) => {
  const statement = await getStatement(req.staff, period(req));
  const wb = await statementWorkbook(statement);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${statementFileName(statement)}"`);
  await wb.xlsx.write(res);
  res.end();
}));

staffStatementRouter.get('/conditions', requireStaff('PATRON'), handle(async (req, res) => {
  res.json(await getTerms());
}));

staffStatementRouter.post('/conditions', requireStaff('PRESTATAIRE'), handle(async (req, res) => {
  res.status(201).json(await createTerms(req.staff, termsSchema.parse(req.body), requestMeta(req)));
}));

staffStatementRouter.delete('/conditions/:id', requireStaff('PRESTATAIRE'), handle(async (req, res) => {
  res.json(await deleteTerms(req.staff, String(req.params.id), requestMeta(req)));
}));
