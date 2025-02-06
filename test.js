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

const firstDate = '2025-02-06'
const lastDate = '2025-04-30'
const datesToCheck = makeDateSequence([firstDate, lastDate])

const arriveBefore = '11:00'
const departAfter = '16:00'

const outputData = []
const outputPath = new URL('./BrusselsParis.json', import.meta.url).pathname

for (const date of datesToCheck) {
  console.log(`Checking ${date}`)

  const latestOutboundArrival = dayjs(`${date} ${arriveBefore}`, 'Europe/Paris')
  const earliestInboundDeparture = dayjs(`${date} ${departAfter}`, 'Europe/Paris')

  const { outbounds, inbounds } = await _getJourneys({
    origin: BRUSSELS,
    destination: PARIS,
    outboundDate: date,
    inboundDate: date
  })

  const filteredJourneys = [
    outbounds
      .filter((journey) => dayjs(journey.arrivalTime).isBefore(latestOutboundArrival) && journey.lowestPrice !== null)
      .sort((a, b) => a.lowestPrice < b.lowestPrice ? -1 : 1),
    inbounds
      .filter((journey) => dayjs(journey.departureTime).isAfter(earliestInboundDeparture) && journey.lowestPrice !== null)
      .sort((a, b) => a.lowestPrice < b.lowestPrice ? -1 : 1)
  ]

  if (filteredJourneys.every((journeys) => journeys.length > 0)) {
    outputData.push({
      date,
      price: filteredJourneys[0][0].lowestPrice + filteredJourneys[1][0].lowestPrice
    })
  }
}

await write(outputPath, JSON.stringify(outputData, null, 2))
