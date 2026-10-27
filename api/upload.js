import { supabase } from './lib/supabase.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { filename, contentType, base64Data } = req.body || {};
  if (!base64Data || !filename) {
    return res.status(400).json({ error: 'Missing filename or base64Data' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client is not configured' });
  }

  try {
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `uploads/${Date.now()}-${safeName}`;

    const { data, error } = await supabase.storage
      .from('attachments')
      .upload(storagePath, buffer, {
        contentType: contentType || 'application/octet-stream',
        upsert: true
      });

    if (error) {
      console.error('Storage upload error:', error);
      return res.status(500).json({ error: 'Storage upload failed: ' + error.message });
    }

    const { data: pubData } = supabase.storage
      .from('attachments')
      .getPublicUrl(storagePath);

    return res.status(200).json({
      success: true,
      url: pubData.publicUrl,
      filename: filename,
      contentType: contentType
    });
  } catch (err) {
    console.error('Upload exception:', err);
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
}
