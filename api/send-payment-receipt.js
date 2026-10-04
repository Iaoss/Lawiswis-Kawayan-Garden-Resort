import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { sendPaymentReceipt } from '../lib/sendPaymentReceipt';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Not authorized.' });

  const { paymentDocumentId } = req.body || {};
  if (!paymentDocumentId || !adminDb) return res.status(400).json({ error: 'A valid paymentDocumentId is required.' });

  try {
    const result = await sendPaymentReceipt(adminDb, FieldValue, paymentDocumentId);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Payment receipt email failed:', error);
    return res.status(500).json({ error: error.message || 'Could not send the payment receipt.' });
  }
}
