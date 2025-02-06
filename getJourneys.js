import { readFile } from 'node:fs/promises'
import dayjs from 'dayjs'
import ky from 'ky'

import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

// Set up config
const url = 'https://site-api.eurostar.com/gateway'

const headers = {
  'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  Referer: 'https://www.eurostar.com/',
  'Content-Type': 'application/json'
}

const query = `
query NewBookingSearch(
  $origin: String!
  $destination: String!
  $outbound: String!
  $inbound: String
  $productFamilies: [String] = ["PUB"]
  $contractCode: String = "EIL_ALL"
  $adult: Int
  $filteredClassesOfService: [ClassOfServiceEnum]
  $filteredClassesOfAccommodation: [ClassEnum]
  $currency: Currency!
  $isAftersales: Boolean = false
  $hasInbound: Boolean = false
) {
  journeySearch(
    outboundDate: $outbound
    inboundDate: $inbound
    origin: $origin
    destination: $destination
    adults: $adult
    productFamilies: $productFamilies
    contractCode: $contractCode
    isAftersales: $isAftersales
    currency: $currency
  ) {
    outbound {
      ...searchBound
    }
    inbound @include(if: $hasInbound) {
      ...searchBound
    }
  }
}
fragment searchBound on Offer {
  journeys(
    hideIndirectTrainsWhenDisruptedAndCancelled: false
    hideDepartedTrains: true
    hideExternalCarrierTrains: true
  ) {
    ...journey
  }
}
fragment journey on Journey {
  fares(
    filteredClassesOfService: $filteredClassesOfService
    filteredClassesOfAccommodation: $filteredClassesOfAccommodation
  ) {
    classOfService {
      name
    }
    prices {
      total
    }
    legs {
      serviceName
      timing {
        departureTime: departs
        arrivalTime: arrives
      }
    }
  }
}
`

const json = {
  operationName: 'NewBookingSearch',
  query,
  variables: {
    contractCode: 'EIL_ALL',
    adult: 1,
    currency: 'EUR',
    filteredClassesOfService: [
      'STANDARD',
      'PLUS',
      'PREMIER'
    ]
  }
}

// Read station info
const stationsPath = new URL('./data/meta/stations.json', import.meta.url).pathname
const stations = await readFile(stationsPath, 'utf-8').then(JSON.parse)

const getJourneys = async ({ origin, destination, outboundDate, inboundDate = null }) => {
  const originStation = stations.find(({ uicCode }) => uicCode === origin)
  const destinationStation = stations.find(({ uicCode }) => uicCode === destination)

  const data = await ky.post(url, {
    headers,
    json: {
      ...json,
      variables: {
        ...json.variables,
        origin,
        destination,
        outbound: outboundDate,
        inbound: inboundDate,
        hasInbound: inboundDate !== null
      }
    }
  }).text()
    .then(JSON.parse)
    .then((json) => json.data.journeySearch)
    .then((journeyData) => Object.entries(journeyData).map(([direction, directionData]) => [
      direction,
      directionData.journeys
        .map((journey) => journey.fares)
        .map((fares) => {
          const commonData = fares[0].legs[0]
          const prices = fares.map(({ classOfService, prices }) => ({
            classOfService: classOfService.name,
            price: prices.total
          }))

          const filteredPrices = prices.filter(({ price }) => price).map(({ price }) => price)
          const lowestPrice = filteredPrices.length === 0 ? null : Math.min(...filteredPrices)

          const leavesFrom = direction === 'outbound' ? originStation : destinationStation
          const arrivesAt = direction === 'outbound' ? destinationStation : originStation

          return {
            serviceName: commonData.serviceName,
            from: leavesFrom.name,
            to: arrivesAt.name,
            departureTime: dayjs.tz(`${direction === 'outbound' ? outboundDate : inboundDate} ${commonData.timing.departureTime}`, leavesFrom.timezone).format(),
            arrivalTime: dayjs.tz(`${direction === 'outbound' ? outboundDate : inboundDate} ${commonData.timing.arrivalTime}`, arrivesAt.timezone).format(),
            lowestPrice,
            prices
          }
        })
    ]))
    .then((entryData) => Object.fromEntries(entryData))

  return {
    outbounds: data.outbound,
    inbounds: data.inbound
  }
}

export default getJourneys
