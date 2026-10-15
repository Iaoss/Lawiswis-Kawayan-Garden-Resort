export const BOOKING_TYPE_MODAL_EVENT = 'lkgr:open-booking-type-modal';

export function openBookingTypeModal() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(BOOKING_TYPE_MODAL_EVENT));
}

