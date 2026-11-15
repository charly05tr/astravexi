import type { Role } from '../../core/profiles/model';

export const ROLE_LABEL: Record<Role, string> = {
  astronaut: 'Astronaut',
  cmo: 'Crew Medical Officer',
  flightSurgeon: 'Flight surgeon',
};

export const ROLE_HINT: Record<Role, string> = {
  astronaut: 'Records check-ins and decides on suggested routine changes.',
  cmo: 'Reviews the crew, acknowledges warnings and manages profiles.',
  flightSurgeon: 'Reviews the crew and acknowledges warnings.',
};
