import { supabase } from '../lib/supabase.js';

const STORAGE_BUCKET = 'attachments';
const STORAGE_FILE = 'system/terms_signatures.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Health / Verification check
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'active',
      terms_version: 'beta-pilot-v1.0',
      message: 'Abrevia Beta Terms & Safeguards Audit Registry is active.'
    });
  }

  // POST: Record an electronic signature & terms acceptance
  if (req.method === 'POST') {
    try {
      const {
        signerName,
        deviceId,
        organization,
        ackBeta,
        ackNoSensitive,
        ackTerms,
        termsVersion
      } = req.body || {};

      if (!ackBeta || !ackNoSensitive || !ackTerms) {
        return res.status(400).json({ error: 'All mandatory beta safeguards and terms acknowledgments must be accepted' });
      }

      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                       req.headers['x-real-ip'] ||
                       req.socket?.remoteAddress ||
                       'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      const nowIso = new Date().toISOString();
      const signatureId = `sig_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Support bare-minimum frictionless device signature (no personal/company name required)
      const effectiveSigner = (signerName && typeof signerName === 'string' && signerName.trim().length >= 2)
        ? signerName.trim()
        : `Device Operator (${deviceId || 'Client Hardware'})`;

      const signatureRecord = {
        id: signatureId,
        signer_name: effectiveSigner,
        device_id: deviceId || 'unknown_device',
        organization: organization ? organization.trim() : 'N/A (Frictionless Device Clickwrap)',
        ack_beta_testing: Boolean(ackBeta),
        ack_no_sensitive_phi: Boolean(ackNoSensitive),
        ack_terms_accepted: Boolean(ackTerms),
        device_liability_confirmed: true,
        terms_version: termsVersion || 'beta-pilot-v1.0',
        timestamp: nowIso,
        ip_address: clientIp,
        user_agent: userAgent,
        operator_entity: 'Abrevia App',
        safeguard_disclaimer: 'Abrevia Beta Testing Stage. Functional testing only. Strict prohibition on PHI / HIPAA / sensitive personal data.'
      };

      // 1. Persist audit record to Supabase Storage
      if (supabase) {
        try {
          let existingList = [];
          const { data: fileData, error: dlErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(STORAGE_FILE);

          if (!dlErr && fileData) {
            try {
              const text = await fileData.text();
              existingList = JSON.parse(text) || [];
            } catch (pErr) {
              existingList = [];
            }
          }

          existingList.push(signatureRecord);

          const buffer = Buffer.from(JSON.stringify(existingList, null, 2), 'utf8');
          await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(STORAGE_FILE, buffer, {
              contentType: 'application/json',
              upsert: true
            });
        } catch (storageErr) {
          console.warn('Storage audit save notice:', storageErr.message);
        }

        // 2. Also attempt optional database table insert if table exists
        try {
          await supabase.from('terms_signatures').insert({
            signature_id: signatureRecord.id,
            signer_name: signatureRecord.signer_name,
            organization: signatureRecord.organization,
            terms_version: signatureRecord.terms_version,
            ip_address: signatureRecord.ip_address,
            user_agent: signatureRecord.user_agent,
            created_at: signatureRecord.timestamp
          });
        } catch (dbErr) {
          // Table might not exist yet; storage JSON is the primary audit log
        }
      }

      console.log(`[Terms Audit] Electronic signature recorded: ${signatureRecord.signer_name} (${signatureRecord.id}) at ${signatureRecord.timestamp} from IP ${clientIp}`);

      return res.status(201).json({
        success: true,
        signature: {
          id: signatureRecord.id,
          signer_name: signatureRecord.signer_name,
          organization: signatureRecord.organization,
          timestamp: signatureRecord.timestamp,
          terms_version: signatureRecord.terms_version
        }
      });
    } catch (err) {
      console.error('Error recording terms signature:', err);
      return res.status(500).json({ error: 'Failed to record terms signature: ' + err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
