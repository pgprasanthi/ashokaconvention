// Lightweight keyword-based classification to separate genuine venue
// enquiries from job seekers and spam that land in the same WhatsApp inbox
// (see whatsappRoutes.js) - sticky once set (see whatsappLeads.js), since
// one clear job/spam message is enough signal, and a later on-topic message
// from the same number doesn't retroactively make it a venue enquiry.
//
// English-only by design (the user's explicit choice over AI classification,
// knowing the tradeoff) - a mixed-language conversation (this inbox gets a
// fair amount of Telugu) that never uses one of these English phrases stays
// unclassified, same as an ordinary enquiry. Tune these patterns as new
// false negatives/positives turn up in real traffic.
const JOB_SEEKER_PATTERN = /\b(job|vacanc(?:y|ies)|vecancy|hiring|interview|resume|\bcv\b|years?\s+(?:of\s+)?experience|work experience|salary)\b/i
const SPAM_PATTERN = /(renewal amount|business profile will|google\s*pay|phone\s*pe number|free installation|cc camera|landline number|shared via|click here to claim|you(?:'ve| have) won|limited time offer)/i

export function classifyMessage(text) {
  if (!text) return ''
  if (JOB_SEEKER_PATTERN.test(text)) return 'job_seeker'
  if (SPAM_PATTERN.test(text)) return 'spam'
  return ''
}
