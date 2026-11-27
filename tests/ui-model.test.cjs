const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveDay } = require('../src/ui/model.ts');
test('Today focus follows pending priority, then planned time without mutating tasks', () => {
  const tasks = [
    {id:'done',date:'2026-11-10',time:'08:00',priority:'重要',completed:true,minutes:20},
    {id:'later',date:'2026-11-10',time:'16:00',priority:'普通',completed:false,minutes:30},
    {id:'focus',date:'2026-11-10',time:'14:00',priority:'重要',completed:false,minutes:50},
    {id:'other',date:'2026-11-11',time:'10:00',priority:'重要',completed:false,minutes:60}
  ];
  const day = deriveDay(tasks, '2026-11-10');
  assert.equal(day.focus.id, 'focus');
  assert.deepEqual(day.rest.map(t=>t.id), ['later']);
  assert.deepEqual(day.done.map(t=>t.id), ['done']);
  assert.equal(day.percent, 33);
  assert.equal(day.plannedMinutes, 100);
  assert.deepEqual(tasks.map(t=>t.id), ['done','later','focus','other']);
});
