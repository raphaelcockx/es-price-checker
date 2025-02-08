import { makeDateSequence } from './dates.js'
import getJourneys from './getJourneys.js'

import Bottleneck from 'bottleneck'
import dayjs from 'dayjs'
import write from 'write'

import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

// Stations
const ANTWERP = '8821006'
const BRUSSELS = '8814001'
const PARIS = '8727100'

// Set up rate limiting
const limiter = new Bottleneck({
  minTime: 500
})

const _getJourneys = limiter.wrap(getJourneys)

const firstDate = '2025-02-08'
const lastDate = '2025-04-30'
const datesToCheck = makeDateSequence([firstDate, lastDate])

const outboundEarliestDeparture = '07:59'
const outboundLatestArrival = '11:01'

const inboundEarliestDeparture = '15:59'
const inboundLatestArrival = '20:01'

const outputData = []
const outputPath = new URL('./BrusselsParis.json', import.meta.url).pathname

for (const date of datesToCheck) {
  console.log(`Checking ${date}`)

  const _outboundEarliestDeparture = dayjs(`${date} ${outboundEarliestDeparture}`, 'Europe/Paris')
  const _outboundLatestArrival = dayjs(`${date} ${outboundLatestArrival}`, 'Europe/Paris')

  const _inboundEarliestDeparture = dayjs(`${date} ${inboundEarliestDeparture}`, 'Europe/Paris')
  const _inboundLatestArrival = dayjs(`${date} ${inboundLatestArrival}`, 'Europe/Paris')

  const { outbounds, inbounds } = await _getJourneys({
    origin: BRUSSELS,
    destination: PARIS,
    outboundDate: date,
    inboundDate: date
  })

  const filteredJourneys = [
    outbounds
      .filter((journey) => dayjs(journey.departureTime).isAfter(_outboundEarliestDeparture) && dayjs(journey.arrivalTime).isBefore(_outboundLatestArrival) && journey.lowestPrice !== null)
      .sort((a, b) => a.lowestPrice < b.lowestPrice ? -1 : 1),

    inbounds
      .filter((journey) => dayjs(journey.departureTime).isAfter(_inboundEarliestDeparture) && dayjs(journey.arrivalTime).isBefore(_inboundLatestArrival) && journey.lowestPrice !== null)
      .sort((a, b) => a.lowestPrice < b.lowestPrice ? -1 : 1)
  ]

  if (filteredJourneys.every((journeys) => journeys.length > 0)) {
    outputData.push({
      date,
      price: filteredJourneys[0][0].lowestPrice + filteredJourneys[1][0].lowestPrice
    })
  }
}

await write(outputPath, JSON.stringify(outputData.sort((a, b) => a.price < b.price ? -1 : 1), null, 2))
