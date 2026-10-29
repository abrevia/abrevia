/**
 * AWS Translate & Bedrock HIPAA-Compliant Translation Engine
 * Covered under AWS Business Associate Addendum (BAA).
 */
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';

let translateClient = null;

function getTranslateClient() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  if (!translateClient) {
    translateClient = new TranslateClient({
      region: region,
      credentials: {
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim()
      }
    });
  }
  return translateClient;
}

export function isAwsTranslateConfigured() {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

export async function translateWithAws(text, sourceLang = 'en', targetLang = 'es') {
  const client = getTranslateClient();
  if (!client) {
    throw new Error('AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) not configured');
  }

  // AWS Translate language codes: 'en', 'es', etc.
  const command = new TranslateTextCommand({
    Text: text,
    SourceLanguageCode: sourceLang.toLowerCase(),
    TargetLanguageCode: targetLang.toLowerCase()
  });

  const response = await client.send(command);
  return {
    translated: response.TranslatedText,
    provider: 'aws-translate-hipaa',
    sourceLang: response.SourceLanguageCode,
    targetLang: response.TargetLanguageCode
  };
}
