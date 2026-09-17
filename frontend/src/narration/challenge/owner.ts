import type { QuoteTemplates } from './types';

/** The owner: impatient, thinks in assets and windows, reaches for the deadline first. */
export const OWNER_QUOTES: QuoteTemplates = {
  'four-factor': [
    'I do not coach, but I can read. {value} on {issue} while the league sits at {league}. I am not paying for that twice.',
    'Somebody explain {issue} to me. {value}. The league gets {league}. Solve it before the deadline passes.',
    'You have a hole and everyone in the building can see it: {issue}, {value} against {league}. Go get the fix.',
  ],
  'bench-over-starter': [
    '{player} puts up {points} points in {minutes} minutes and we start {other} in front of him. Explain the business case.',
    'The cheapest move we have is free: play {player}. {points} points in {minutes} minutes. {other} can wait his turn.',
    'I watch {player} for {minutes} minutes and I see {points} points. Then I watch {other}. Fix the order.',
  ],
  'worst-plus-minus': [
    '{player} has been on the floor for our worst stretches. {value} a night. Move him while he still has value.',
    'Every bad run this half has the same man in it. {player}, {value} in {minutes} minutes. Somebody out there still likes him — call them.',
    'I am not sentimental. {player} is {value} a night. That is an asset losing value in front of us.',
  ],
  'play-unstaffed': [
    'We are running one fewer play than everyone we face. {play}: {missing}. Trade for the man who makes it legal.',
    '{play} is sitting in a drawer. {missing}. Either staff it at the deadline or stop telling me about it.',
    'I signed off on {play} and it has never been run. {missing}. That is one phone call away.',
  ],
  'play-idle': [
    '{play} belongs to {player} and {player} plays {minutes} minutes. We are paying for a play we barely call.',
    'Either {player} gets minutes or we bring in somebody who can run {play}. {minutes} minutes a night is a waste of a card.',
    'You built {play} around a man who is out there {minutes} minutes. Make it a real play or make a real trade.',
  ],
  'identity-near': [
    '{plan} is one piece away and the deadline is today. {missing}. That is exactly what a deadline is for.',
    'Nobody wants to be almost anything. {missing}, and this team is {plan}. Go and get it.',
    'I will approve the move that gets us {plan}. {missing}. Bring me that name.',
  ],
  'pace-band': [
    '{band}. I did not buy a team to finish {band}. The deadline is open — use it.',
    'Here is my read on the first half: {band}, and that is not the season anyone here promised me.',
    'We are trending {band}. I would rather be wrong at the deadline than right in June.',
  ],
  'pace-hold': [
    'I am already planning the parade route. The deadline can pass. Do nothing.',
    'We are {band}. I have never said this before and will not again: I do not want a trade.',
    '{band}. Every call I take today gets the same answer. No.',
  ],
  'form-hold': [
    '{points} scored, {allowed} allowed, every single night. I am not gambling on a roster that is not losing.',
    'The margin speaks for itself: {points} for, {allowed} against. Touch nothing.',
    'You do not renovate a house at {points} and {allowed} a night. Keep the twelve we have.',
  ],
  'deep-bench': [
    'If it costs us nothing, it is not a gamble. {player} plays {minutes} minutes. Flip him for a lottery ticket.',
    'One low-risk move: {player}, {minutes} minutes a night. Worst case we get back what we had.',
    'The end of the bench is free money. {player} at {minutes} minutes is the only name I would move.',
  ],
};
