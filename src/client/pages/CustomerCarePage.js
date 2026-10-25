import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/accordion';
import { BRASS, CREAM, FOREST, INK, LINE, PAPER, SERIF, SANS } from '../components/clientTheme';

const pages = {
  faqs: {
    title: 'Frequently Asked Questions',
    intro: 'Helpful answers for planning your stay at Lawiswis Kawayan Garden Resort.',
    items: [
      {
        question: 'Where is Lawiswis Kawayan Resort located?',
        answer: <>We are located in Calumpit, Bulacan, a peaceful and accessible retreat just a short drive from Metro Manila. Our exact address can be found on our <Link to="/contact-us" style={{ color: FOREST, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}>Contact Us page</Link>.</>,
      },
      {
        question: 'What is your check-in and check-out time?',
        answer: 'We have flexible stay hours: 11:00 AM–8:00 AM, 3:00 PM–12:00 NN, and 7:00 PM–4:00 PM. Please inquire to check the availability of your preferred stay hours and room.',
      },
      {
        question: 'What types of accommodations do you offer?',
        answer: 'We offer a variety of accommodations, including:',
        details: [
          '7 suites with kitchens, one featuring a theater room',
          '23 standard air-conditioned rooms with private toilet, bath, and shower heaters',
          'A private house with a master bedroom, guest rooms, and a fully equipped kitchen',
          'The Main Villa with 4 bedrooms and a shared kitchen',
        ],
      },
      {
        question: 'What are your pool facilities?',
        answer: 'Our resort features:',
        details: [
          'Adult pool (3–6 ft deep)',
          'Kiddie pool (18 inches deep)',
          'Bubble pool (2 ft deep)',
        ],
        closing: 'We also have poolside cabanas, a bar, a pavilion, and covered daybeds for your comfort and relaxation.',
      },
      {
        question: 'Do you accommodate large groups for events and functions?',
        answer: 'Yes. We have an air-conditioned function hall for weddings, corporate events, and other gatherings. The dining hall offers covered and al fresco seating, while the manicured garden and pavilion provide spaces for outdoor events.',
      },
      {
        question: 'What activities and amenities are available during my stay?',
        answer: 'During your stay, you can enjoy:',
        details: [
          'Swimming in our pools',
          'Relaxing in our spa',
          'Billiards and our mini gym',
          'Outdoor movie watching and the KTV room',
          'Team-building activities',
          'Exploring our landscaped gardens',
          'Barbecue areas with artistic stonework',
        ],
      },
      {
        question: 'Can we bring food and cook at the resort?',
        answer: 'Yes, guests may bring food. We also offer barbecue areas and fully equipped kitchens in some accommodations for those who prefer to cook.',
      },
      {
        question: 'Can I rent the whole Lawiswis Kawayan Garden Resort property?',
        answer: 'Yes, guests may rent the whole resort privately. Please advise us of your group size and preferred dates so we can check availability.',
      },
      {
        question: 'Are meals included in the accommodation regardless of stay?',
        answer: 'Meals are available upon request. Please inform us during booking so we can confirm whether we can accommodate your request.',
      },
      {
        question: 'Do you allow walk-ins?',
        answer: 'Yes, we allow walk-ins. Availability may vary, so please contact the resort before travelling.',
      },
      {
        question: 'Is the resort wheelchair accessible?',
        answer: 'Yes, our resort is designed to be accessible to guests, including those with mobility challenges. Please contact us in advance to discuss any specific access needs.',
      },
      {
        question: 'Is the resort family-friendly and pet-friendly?',
        answer: 'Absolutely. We have kiddie pools, a playground, and family rooms, making the resort suitable for families with children. Pets are allowed on the property and in rooms, but not in the pools.',
      },
      {
        question: 'Do you have dining options on-site?',
        answer: 'Yes, we have a snack bar and an al fresco lounge for light bites and refreshments. We also have a main kitchen and an in-house coffee shop is planned.',
      },
      {
        question: 'Do you have parking available?',
        answer: 'Yes, our spacious parking area can accommodate up to 30 cars.',
      },
    ],
  },
  'safety-guidelines': {
    title: 'Safety Guidelines',
    intro: 'A few simple reminders help everyone enjoy a safe and comfortable visit.',
    items: [
      ['Pools and water features', 'Follow posted facility signs and staff instructions. Children must be supervised by their accompanying adults around pools and water features.'],
      ['Resort grounds', 'Use designated paths and activity areas, and take care on grass or other surfaces that may be wet or uneven.'],
      ['Activities and equipment', 'Ask resort staff for instructions before using activity equipment, grilling stations, or team-building materials.'],
      ['Need help?', 'For on-site assistance, contact the resort team or front desk. In an emergency, notify staff immediately.'],
    ],
  },
  'health-and-wellness': {
    title: 'Health and Wellness',
    intro: 'We want every guest to feel comfortable during their time at the resort.',
    items: [
      ['Before arrival', 'Please let the resort team know ahead of time about accessibility needs or other arrangements that may help make your stay comfortable.'],
      ['During your visit', 'Please follow posted pool and facility guidance, and let resort staff know if you need assistance.'],
      ['Contact the team', 'For health, wellness, or accessibility questions, please use the Contact Us page before your visit.'],
    ],
  },
  'cancellation-policy': {
    title: 'Cancellation & Refund Policy',
    eyebrow: 'Policies',
    lastUpdated: 'October 25, 2026',
    intro: 'Please review the following terms for cancellations, changes and refunds before booking.',
    items: [
      ['1. 30-day notice', 'A cancellation penalty equivalent to 50% of the total accommodation charge will be imposed for booking cancellations made LESS than thirty (30) days prior to guest’s arrival.'],
      ['2. 7-day notice', 'A cancellation penalty equivalent to FULL charge will be imposed for booking cancellations made LESS than seven (7) days prior to guest’s arrival or will be considered as NO SHOW.'],
      ['3. Cancellation on arrival date', 'Should cancellation be made upon arrival date; it will be considered as NO SHOW.'],
      ['4. Non-refundable payments', 'The amount paid is non-refundable or convertible in case of changes in booking upon arrival or during the stay.'],
      ['5. Force majeure', 'In cases of cancellation due to “force majeure”, the Hotel shall not be responsible for the cancellations or failures if such cancellations arise out of causes beyond its control. Such causes may include, but are not restricted to, acts of God or of public enemy, fires, floods, epidemics, quarantine restrictions, strikes, earthquakes, computer or communication failures, and severe weather.'],
      ['6. Changes to reservation', 'No refund will be made in reducing the number of rooms initially reserved, and on change of room type. For shortening of stay, a full room charge shall be observed.'],
      ['7. No show', 'No show is nonrefundable and non-re-bookable. We will keep you posted once there are additional changes.'],
      ['8. Cancellations made 30 days or more before arrival', 'Cancellations made thirty (30) days or more before arrival carry no cancellation penalty. The amount paid is refunded in full.'],
      ['9. Date changes', <>Booking dates can be changed only thirty (30) days or more before arrival, subject to availability, through <Link to="/my-bookings" style={{ color: FOREST, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}>My Bookings</Link>. If the new booking costs more, the difference must be paid. Less than thirty (30) days before arrival, dates can no longer be moved: please cancel under this policy and make a new booking.</>],
      ['10. How to request a refund', <>Request a cancellation or refund through <Link to="/my-bookings" style={{ color: FOREST, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}>My Bookings</Link> using your booking reference and the email or mobile number used to book, or contact us. The resort reviews each request and confirms the refundable amount under this policy.</>],
      ['11. How refunds are paid', 'Approved refunds of online payments are returned to the original payment method (card or e-wallet) through our payment provider, PayMongo. The time it takes to appear in your account depends on your bank or e-wallet provider. Refunds of payments made at the resort are arranged directly with our front desk.'],
      ['12. Contact', 'Lawiswis Kawayan Garden Resort, 402 Brgy. Buguion, Calumpit, Bulacan, Philippines · Mobile: 0917 811 2332 · Email: lawiswiskawayyyan123@gmail.com'],
    ],
    actions: true,
  },
  'privacy-policy': {
    title: 'Privacy Policy',
    eyebrow: 'Policies',
    lastUpdated: 'October 25, 2026',
    intro: 'Lawiswis Kawayan Garden Resort respects your privacy and complies with the Data Privacy Act of 2012 (Republic Act No. 10173), its Implementing Rules and Regulations, and issuances of the National Privacy Commission. This notice explains what personal data we collect through this website, why, and how we protect it.',
    items: [
      ['Who we are', 'Lawiswis Kawayan Resort Corp., operator of Lawiswis Kawayan Garden Resort, is the personal information controller for data collected through this website. Our contact details are at the end of this notice.'],
      ['What we collect', 'When you book: your first and last name, email address, mobile number, address, preferred contact method, stay dates and times, number of guests, room and cottage choices, special requests, and your booking and payment records (amounts, payment status and transaction references). When you chat with us: the name and mobile number you enter and your messages. When you send feedback, an inquiry, or subscribe to our newsletter: your name, email address and message. We do not collect or store your full card number, card security code or e-wallet password.'],
      ['How we use your data', 'To process, confirm and manage your reservation; to process payments, issue receipts and handle refunds or date changes; to send booking confirmations, arrival reminders and other messages about your stay; to answer your inquiries and chats; to keep our records as required by law; and to protect our website and guests against fraud and misuse. We send newsletters only if you subscribe, and you can unsubscribe at any time.'],
      ['Why we are allowed to use it', 'We process your data to fulfil your booking (the contract between you and the resort), to comply with legal obligations such as tax and accounting rules, for our legitimate interest in keeping the website and our guests secure, and, for newsletters and remembering your details on your device, with your consent.'],
      ['Who we share it with', 'Only with service providers who help us run this website and your booking, and only as needed: PayMongo (online payments and refunds), our email delivery provider (booking and payment emails), and our cloud hosting and database providers (Google Firebase and Vercel). They may process data outside the Philippines under appropriate safeguards. We disclose data to government authorities only when required by law or a valid order. We do not sell your personal data.'],
      ['Cookies and browser storage', 'This website does not use advertising or analytics cookies, and it does not track you across other websites. It uses your browser’s storage only for things the site needs to work: remembering bookings made on this device (shown in My Bookings), keeping your guest chat conversation, remembering notices you have closed, and, only if you tick “Remember my details on this device”, saving your name and contact details so the booking form fills in next time. The staff portal also remembers staff sign-in and display preferences. Fonts and icons are delivered by Google Fonts and jsDelivr, which receive your device’s IP address when they are loaded. When you pay, PayMongo’s checkout page may use its own cookies under its own privacy policy. You can clear this storage at any time in your browser settings or with “Forget my details” on the booking page.'],
      ['How long we keep it', 'We keep booking and payment records for as long as needed to provide your stay and for the period required by Philippine tax, accounting and other laws. Chat messages, inquiries and feedback are kept only as long as needed to respond and improve our service. Data we no longer need is deleted or anonymised.'],
      ['How we protect it', 'Access to personal data is limited to authorised resort staff. Prices, payments and booking changes are checked on our servers, card and e-wallet payments are handled on PayMongo’s secure checkout, and our staff are trained to handle your data confidentially. No system is completely secure, so please contact us right away if you believe your data has been misused.'],
      ['Your rights', <>Under the Data Privacy Act you have the right to be informed, to access your data, to object to its processing, to have it corrected, to have it erased or blocked, to data portability, to claim damages, and to file a complaint with the National Privacy Commission (<a href="https://privacy.gov.ph" target="_blank" rel="noreferrer" style={{ color: FOREST, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}>privacy.gov.ph</a>). To use any of these rights, contact us using the details below.</>],
      ['Contact our Data Protection Officer', 'Data Protection Officer, Lawiswis Kawayan Garden Resort, 402 Brgy. Buguion, Calumpit, Bulacan, Philippines · Mobile: 0917 811 2332 · Email: lawiswiskawayyyan123@gmail.com'],
      ['Changes to this notice', 'We may update this notice from time to time. The latest version is always on this page, with the date it was last updated.'],
    ],
  },
  'terms-of-service': {
    title: 'Terms of Service',
    eyebrow: 'Policies',
    lastUpdated: 'October 25, 2026',
    intro: 'These terms apply when you use this website or book a stay or tour at Lawiswis Kawayan Garden Resort. By booking, you agree to them.',
    items: [
      ['1. Bookings', 'You agree that the details you give when booking are accurate and complete. All bookings are subject to availability. A booking stays pending until the required payment is received and confirmed; a verified online payment of at least the required deposit confirms it automatically, and a confirmation email is sent to you.'],
      ['2. Rates and payment', 'Rates are in Philippine pesos and follow the resort’s published rate card. The total, including extra guests and any cottage, is calculated by our system when you book and is shown before you pay. Online payments are made through PayMongo’s secure checkout. You may pay in full or pay a 50% deposit; the remaining balance must be settled before check-out. Extra services (such as spa or photoshoot packages), extra guests and late check-out charges are added to your bill.'],
      ['3. Check-in and check-out', 'Day tour: 8:00 AM to 5:00 PM. Night tour: 5:00 PM to 10:00 PM. Overnight stays: 10:00 AM to 8:00 AM, 2:00 PM to 12:00 NN, or 6:00 PM to 4:00 PM, as chosen when booking. Same-day bookings close once the chosen check-in time has passed. A valid ID may be requested at check-in. Staying past your check-out time may incur a late check-out charge.'],
      ['4. Changes and cancellations', <>Date changes, cancellations and refunds follow our <Link to="/cancellation-policy" style={{ color: FOREST, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}>Cancellation &amp; Refund Policy</Link>.</>],
      ['5. Guests and room capacity', 'Each room has a maximum number of adults and children, shown when booking. The number of guests may not exceed the room’s capacity, and extra guests are charged according to the rate card.'],
      ['6. Resort rules and conduct', 'Guests agree to follow resort rules and staff instructions, including pool and safety guidelines, to respect other guests, and to take responsibility for any damage or loss caused by members of their party. The resort may refuse service or end a stay without refund for serious or repeated violations.'],
      ['7. Personal belongings', 'Please keep your valuables secure. The resort’s responsibility for loss of or damage to guests’ belongings is limited to what is provided by law.'],
      ['8. Force majeure', 'The resort is not responsible for failure to provide services because of events beyond its control, such as natural disasters, severe weather, epidemics, government restrictions, strikes, or power or communication failures.'],
      ['9. Using this website', 'Please use this website only for lawful purposes. Do not attempt to interfere with it, alter prices or bookings, access other guests’ information, or submit false bookings. Bookings made by tampering with the website may be cancelled.'],
      ['10. Privacy', <>How we handle your personal data is explained in our <Link to="/privacy-policy" style={{ color: FOREST, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}>Privacy Policy</Link>.</>],
      ['11. Governing law', 'These terms are governed by the laws of the Republic of the Philippines.'],
      ['12. Contact', 'Lawiswis Kawayan Garden Resort, 402 Brgy. Buguion, Calumpit, Bulacan, Philippines · Mobile: 0917 811 2332 · Email: lawiswiskawayyyan123@gmail.com'],
    ],
  },
};

export default function CustomerCarePage({ pageKey }) {
  const page = pages[pageKey];
  const location = useLocation();
  if (!page) return null;
  const isFaqPage = pageKey === 'faqs';
  const items = page.items;

  return (
    <div style={{ background: PAPER, minHeight: '100vh' }}>
      <section style={{ background: FOREST, color: '#fff', padding: '78px 24px 84px' }}>
        <div style={{ maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
          <div style={{ color: '#e7dfc4', font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '14px' }}>{page.eyebrow || 'Customer care'}</div>
          <h1 style={{ font: `500 clamp(40px, 6vw, 66px)/1.05 ${SERIF}`, margin: '0 0 16px' }}>{page.title}</h1>
          <p style={{ color: 'rgba(255,255,255,.78)', font: `14px/1.8 ${SANS}`, maxWidth: '650px', margin: 0 }}>{page.intro}</p>
          {page.lastUpdated && <p style={{ color: 'rgba(255,255,255,.6)', font: `12px ${SANS}`, margin: '14px 0 0' }}>Last updated: {page.lastUpdated}</p>}
        </div>
      </section>
      <main style={{ maxWidth: '900px', width: '100%', boxSizing: 'border-box', margin: '0 auto', padding: '56px 24px 86px' }}>
        {isFaqPage ? (
          <Accordion type="single" collapsible className="w-full rounded-xl border border-[#e3ddc8] bg-white px-6">
            {items.map((item, index) => (
              <AccordionItem key={item.question} value={`faq-${index}`}>
                <AccordionTrigger className="text-[14px] leading-6 text-[#22261b]">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-[13px] leading-7 text-[#5c5a4c]">
                  <p className="m-0">{item.answer}</p>
                  {item.details && (
                    <ul className="my-3 list-disc space-y-1 pl-5">
                      {item.details.map(detail => <li key={detail}>{detail}</li>)}
                    </ul>
                  )}
                  {item.closing && <p className="mb-0 mt-3">{item.closing}</p>}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {items.map(([title, content]) => (
              <section key={title} style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '24px 26px' }}>
                <h2 style={{ color: INK, font: `500 23px ${SERIF}`, margin: '0 0 9px' }}>{title}</h2>
                <p style={{ color: '#6b6a5c', font: `13px/1.8 ${SANS}`, margin: 0 }}>{content}</p>
              </section>
            ))}
          </div>
        )}
        {page.actions && (
          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link to="/my-bookings" style={{ background: FOREST, color: '#fff', padding: '13px 24px', font: `600 12px ${SANS}`, letterSpacing: '.1em', textTransform: 'uppercase', textDecoration: 'none' }}>Request Refund</Link>
            <Link to="/my-bookings" style={{ border: `1px solid ${FOREST}`, color: FOREST, padding: '13px 24px', font: `600 12px ${SANS}`, letterSpacing: '.1em', textTransform: 'uppercase', textDecoration: 'none' }}>Change Date</Link>
          </div>
        )}
        <div style={{ marginTop: '24px', background: CREAM, borderLeft: `3px solid ${BRASS}`, padding: '18px 22px', color: '#5c5a4c', font: `13px/1.8 ${SANS}` }}>
          Need more assistance? <Link to={`/contact-us${location.search}`} style={{ color: FOREST, fontWeight: 600 }}>Contact our team</Link>.
        </div>
      </main>
    </div>
  );
}
