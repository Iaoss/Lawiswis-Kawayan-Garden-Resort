import { AUTO_TOPICS, buildAutoAnswer, detectTopic } from './chatAutoReply';

describe('automatic chat answers', () => {
  test('understands typed questions in English and Filipino', () => {
    expect(detectTopic('How much is your room?')).toBe('auto-room-rates');
    expect(detectTopic('magkano po ang kwarto')).toBe('auto-room-rates');
    expect(detectTopic('rates?')).toBe('auto-room-rates');
    expect(detectTopic('magkano cottage?')).toBe('auto-cottage-rates');
    expect(detectTopic('how much is the day tour entrance')).toBe('auto-tour-rates');
    expect(detectTopic('anong oras check in')).toBe('auto-times');
    expect(detectTopic('can I cancel and get a refund?')).toBe('auto-cancellation');
    expect(detectTopic('saan kayo located')).toBe('auto-location');
    expect(detectTopic('pwede gcash payment?')).toBe('auto-booking');
    expect(detectTopic('hello po')).toBeNull();
  });

  test('room rates come from the live room list, one line per kind', () => {
    const rooms = [
      { type: 'Standard', name: 'Couple', price: 3000, capacity: 2 },
      { type: 'Standard', name: 'Couple', price: 3000, capacity: 2 },
      { type: 'FamilyRoom', price: 4600, capacity: 4 },
    ];
    const answer = buildAutoAnswer('auto-room-rates', { rooms });
    expect(answer).toMatch(/₱3,000\/night/);
    expect(answer).toMatch(/₱4,600\/night/);
    expect(answer.split('\n').filter(line => line.startsWith('•'))).toHaveLength(2);
  });

  test('every topic has an answer with real prices', () => {
    AUTO_TOPICS.forEach(topic => expect(buildAutoAnswer(topic.id, { rooms: [] }).length).toBeGreaterThan(20));
    expect(buildAutoAnswer('auto-cottage-rates')).toMatch(/Umbrella Hut.*₱500/);
    expect(buildAutoAnswer('auto-tour-rates')).toMatch(/₱375 per person/);
    expect(buildAutoAnswer('auto-booking')).toMatch(/50% deposit/);
    expect(buildAutoAnswer('nope')).toBe('');
  });
});
