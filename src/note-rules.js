// Shared by the browser and the notes API.
export const NOTE_NAME_LIMIT = 80;
export const NOTE_MESSAGE_LIMIT = 1500;
export const NOTE_REPLY_LIMIT = 1500;
export const NOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/* plain text only: no control characters except line breaks, and no long runs of blank lines */
export function cleanText(value, limit){
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
  return text.length <= limit ? text : null;
}
