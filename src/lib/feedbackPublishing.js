// Which guest reviews may appear on the public website.
//
// A review can be shown only if it is positive (4–5 stars, or marked
// positive) and has a comment. Even then it stays off the website until an
// admin reads it and chooses "Show on website" (publicStatus: 'approved'),
// because a high star rating can still come with a negative comment.

export const MIN_PUBLIC_RATING = 4;

export function canShowOnWebsite(feedback = {}) {
  const sentiment = String(feedback.sentiment || '').toLowerCase();
  const rating = Number(feedback.rating);
  const positive = sentiment ? sentiment === 'positive' : (Number.isFinite(rating) && rating >= MIN_PUBLIC_RATING);
  return positive
    && Number.isFinite(rating) && rating <= 5
    && typeof feedback.comment === 'string'
    && feedback.comment.trim().length > 0
    && feedback.comment.length <= 2000;
}

export function isShownOnWebsite(feedback = {}) {
  return canShowOnWebsite(feedback)
    && feedback.publicStatus === 'approved'
    && feedback.hidden !== true;
}

// Positive reviews nobody has decided on yet.
export function awaitsWebsiteDecision(feedback = {}) {
  return canShowOnWebsite(feedback) && !feedback.publicStatus;
}
