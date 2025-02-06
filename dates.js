import dayjs from 'dayjs'

const makeDateSequence = function ([firstDate, lastDate]) {
  const daysToOutput = dayjs(lastDate).diff(dayjs(firstDate), 'days') + 1

  return [...new Array(daysToOutput)].map((d, i) => dayjs(firstDate).add(i, 'days').format('YYYY-MM-DD'))
}

export {
  makeDateSequence
}
