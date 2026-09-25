/** Mounted after the Money router's authenticated person scope. */
import { Router } from 'express';
import { ZodError } from 'zod';
import { getReconciliationStatus, listReconciliationReview, resolveReconciliation } from '../services/money/reconciliationService.js';
const router = Router();
const fail = (res, error) => res.status(error instanceof ZodError ? 400 : error.status || 503).json({ success:false, error: error instanceof ZodError ? 'Invalid payment review request.' : error.message });
router.get('/', async (req,res) => {
  try { const status=await getReconciliationStatus(req.user.id); res.status(status.state==='unavailable'?503:200).json({success:status.state!=='unavailable',data:status}); } catch (error) { fail(res,error); }
});
router.get('/review', async (req,res) => {
  try { res.json({success:true,data:await listReconciliationReview(req.user.id,{offset:Number(req.query.offset || 0),limit:Number(req.query.limit || 20)})}); } catch (error) { fail(res,error); }
});
router.post('/:id/resolve', async (req,res) => {
  try { res.json({success:true,data:await resolveReconciliation(req.user.id,req.params.id,req.body)}); } catch (error) { fail(res,error); }
});
export default router;
