import { Router } from 'express';
import { requestOtp, verifyOtp } from '../controllers/auth.controller';

const router = Router();

router.post('/request-otp', requestOtp as any);
router.post('/verify-otp', verifyOtp as any);

export default router;
