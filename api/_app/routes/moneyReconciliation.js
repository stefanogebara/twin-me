/** Mounted after the Money router's authenticated person scope. */
import { Router } from 'express';
import { ZodError } from 'zod';
import { getReconciliationStatus, listReconciliationReview, resolveReconciliation } from '../services/money/reconciliationService.js';
import { inPersonScope, refreshRecurring } from '../services/money/store.js';
import { quietly } from '../services/money/quietly.js';
const router = Router();
const fail = (res, error) => res.status(error instanceof ZodError ? 400 : error.status || 503).json({ success:false, error: error instanceof ZodError ? 'Invalid payment review request.' : error.message });
router.get('/', async (req,res) => {
  try { const status=await getReconciliationStatus(req.user.id); res.status(status.state==='unavailable'?503:200).json({success:status.state!=='unavailable',data:status}); } catch (error) { fail(res,error); }
});
router.get('/review', async (req,res) => {
  try { res.json({success:true,data:await listReconciliationReview(req.user.id,{offset:Number(req.query.offset || 0),limit:Number(req.query.limit || 20)})}); } catch (error) { fail(res,error); }
});
/* A resolved review makes or links a line, and the last one opens every write the review held
   shut: the standing charges are stored before the page reloads, never by its read (C3). */
router.post('/:id/resolve', async (req,res) => {
  try {
    const data=await resolveReconciliation(req.user.id,req.params.id,req.body);
    await inPersonScope(req.user.id,()=>refreshRecurring(req.user.id)).catch(quietly('review/recurring',undefined));
    res.json({success:true,data});
  } catch (error) { fail(res,error); }
});
export default router;
