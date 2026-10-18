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
    title: 'Cancellation Policy',
    intro: 'Please review the following terms for cancellations, changes and refunds.',
    items: [
      ['1. 30-day notice', 'A cancellation penalty equivalent to 50% of the total accommodation charge will be imposed for booking cancellations made LESS than thirty (30) days prior to guest’s arrival.'],
      ['2. 7-day notice', 'A cancellation penalty equivalent to FULL charge will be imposed for booking cancellations made LESS than seven (7) days prior to guest’s arrival or will be considered as NO SHOW.'],
      ['3. Cancellation on arrival date', 'Should cancellation be made upon arrival date; it will be considered as NO SHOW.'],
      ['4. Non-refundable payments', 'The amount paid is non-refundable or convertible in case of changes in booking upon arrival or during the stay.'],
      ['5. Force majeure', 'In cases of cancellation due to “force majeure”, the Hotel shall not be responsible for the cancellations or failures if such cancellations arise out of causes beyond its control. Such causes may include, but are not restricted to, acts of God or of public enemy, fires, floods, epidemics, quarantine restrictions, strikes, earthquakes, computer or communication failures, and severe weather.'],
      ['6. Changes to reservation', 'No refund will be made in reducing the number of rooms initially reserved, and on change of room type. For shortening of stay, a full room charge shall be observed.'],
      ['7. No show', 'No show is nonrefundable and non-re-bookable. We will keep you posted once there are additional changes.'],
    ],
    actions: true,
  },
  'privacy-policy': {
    title: 'Privacy Policy',
    intro: 'The privacy and security of personal data collected from you – our guests, clients, members, visitors and suppliers – are important to Lawiswis Kawayan Garden Resort. The officers and employees of Lawiswis Kawayan Garden Resort adhere to the principles of Data Privacy Act (RA 10173) and comply with the best data privacy practices sanctioned in its Implementing Rules and Regulations and Memorandum Circulars issued by the National Privacy Commission.',
    items: [
      ['Collection of Personal Data', 'In the ordinary course of business, Lawiswis Kawayan Garden Resort may collect your personal data such as your name, phone number, gender, marital status, age, health, or education and other personal information.'],
      ['Use of Personal Data', 'We use this data to facilitate our transaction, provide with you personalized customer service experience, and most especially, to be more efficient in providing you with the best hotel services.'],
      ['Non-Disclosure of Personal Data', 'Lawiswis Kawayan Garden Resort will not disclose your personal information without your consent or in any circumstance not authorized by law or any valid order of court or government agencies.'],
      ['Security of Personal Data', 'Lawiswis Kawayan Garden Resort applies strict security measures and modern technologies to make sure your personal data are kept confidential and secured with us. Our employees are trained to handle your personal data with utmost confidentiality and we have internal control in place to avoid security breach or violation.'],
      ['Use of Cookies', 'In visiting our website, cookies are utilized. Cookies are small files that our site transfers to your computer or smart phones through your web browser that enables the site’s system to recognize or remember certain information. The information gathered is used for statistical and analytical purposes. We may also use your browsing behavior to develop promotional offers, products, and services that we feel are beneficial to you. Cookies help us provide you with a better service by enabling us to understand your preferences based on previous or current website activity. However, a cookie gives us no access to your computer or any information about you other than the data you choose to share with us. You can choose to access or decline cookies. Most web browsers automatically accept cookies. You can modify your browser setting to decline cookies, if you prefer, but this may prevent you from taking full advantage of our website. By continuing to visit or use our website, you are agreeing to the use of cookies and similar technologies for the purposes we describe in this policy.'],
      ['Data Privacy Rights', 'You may inquire or request for information regarding any matter relating to the processing of your personal data including the data privacy and security policies implemented by Lawiswis Kawayan Garden Resort to ensure the protection of your personal data. You may also request for an updating, rectification or amendment of your personal data or file complaint in case of any breach or violation of your privacy.'],
      ['Send your inquiry or request to', 'Address: 402 Brgy. Buguion, Calumpit, Bulacan, PH · Mobile No: 0917 811 2332 · Email: lawiswiskawayyyan123@gmail.com'],
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
          <div style={{ color: '#e7dfc4', font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '14px' }}>Customer care</div>
          <h1 style={{ font: `500 clamp(40px, 6vw, 66px)/1.05 ${SERIF}`, margin: '0 0 16px' }}>{page.title}</h1>
          <p style={{ color: 'rgba(255,255,255,.78)', font: `14px/1.8 ${SANS}`, maxWidth: '650px', margin: 0 }}>{page.intro}</p>
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
