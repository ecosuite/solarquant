import moment, { Moment } from 'moment';

export interface MomentRange {
  beginInclusive: Moment,
  endExclusive: Moment,
}

export function getDateRanges(a: Moment, b: Moment): MomentRange[] {
  let ret: MomentRange[] = []
  const end = moment(b)

  for (let start = moment(a); start.isBefore(end);) {
    const rangeEnd = moment.min(moment(start).add(1, 'months'), end)
    ret.push({
      beginInclusive: moment(start),
      endExclusive: moment(rangeEnd),
    })
    start = moment(rangeEnd)
  }

  return ret
}
