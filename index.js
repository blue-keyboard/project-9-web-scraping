const puppeteer = require('puppeteer')
const fs = require('fs')

const URL = 'https://coinmarketcap.com/'
const ENTRIES = process.argv[2] ? Number(process.argv[2]) : 500
const keys = []
const cryptocoinData = []

const scrapper = async (url) => {
   if (!Number.isInteger(ENTRIES) || ENTRIES < 1) {
      console.log('Please provide a valid number as an argument')
      return
   } else if (ENTRIES > 3000) {
      console.log('Number is too big')
      return
   }
   console.log(url + '\n')
   console.log(`--- Running for ${ENTRIES} entries ---\n`)

   const browser = await puppeteer.launch({ headless: false })
   const [page] = await browser.pages()
   await page.goto(URL, {
      waitUntil: 'networkidle2'
   })
   await page.setViewport({ width: 1024, height: 1024 })

   repeat(page, 1, browser)
}

const repeat = async (page, pageNumber, browser) => {
   let goNextPage = true

   await scrollDown(page)

   if (pageNumber === 1) {
      try {
         await page.click('.banner-close')
      } catch (error) {}
      try {
         await page.click('#onetrust-reject-all-handler')
      } catch (error) {}

      await getKeysFromTableHead(page)
      console.log('--- FIELDS ---')
      keys
         .map((key, i) => `${i + 1}: ${key}`)
         .forEach((key) => console.log(key))
   }

   console.log(`\n### PAGE ${pageNumber} ###`)

   const arrayRows = await page.$$('.cmc-table tbody tr')

   // Get all the values we need, push the objects to the array.
   for (const [index, row] of arrayRows.entries()) {
      const tds = await row.$$('td')
      const coin_obj = {}

      for (const [index, td] of tds.slice(1, 10).entries()) {
         let key = keys[index]

         try {
            const p = await td.$eval('p', (el) => (el = el.textContent))

            coin_obj[key] = p
            if (key === 'market_cap') {
               coin_obj[key] = p.substring(p.indexOf('$', 1))
            }

            if (key === 'name') {
               const symbol = await td.$eval(
                  '.coin-item-symbol',
                  (el) => (el = el.textContent)
               )
               const icon = await td.$eval('img', (el) => el.src)
               coin_obj['symbol'] = symbol
               coin_obj['icon'] = icon
            }
         } catch (error) {
            try {
               const span = await td.$eval('span', (el) => {
                  if (
                     el.firstElementChild?.classList.contains('icon-Caret-down')
                  ) {
                     return '-' + el.textContent
                  }

                  return el.textContent
               })
               coin_obj[key] = span
            } catch (error) {
               continue
            }
         }
      }
      cryptocoinData.push(coin_obj)
      console.log('ENTRIES: ', cryptocoinData.length)

      if (cryptocoinData.length === ENTRIES) {
         goNextPage = false
         break
      }
   }

   if (goNextPage) {
      try {
         await page.$eval('.pagination .next>a', (el) => el.click())
         repeat(page, pageNumber + 1, browser)
      } catch (error) {
         console.log('No more pages')
         await browser.close()
         write(cryptocoinData)
         return
      }
   } else {
      await browser.close()
      write(cryptocoinData)
      return
   }
}

// Dinamically get all the keys, also make them syntactically correct for a key
const getKeysFromTableHead = async (page) => {
   const arrayHead = await page.$$('thead tr th')

   for (const th of arrayHead.slice(1, 10)) {
      let key
      try {
         key = await th.$eval('p', (el) => (el = el.textContent))
         key = key
            .toLowerCase()
            .replace('%', 'percentage')
            .replace('#', 'rank')
            .replace(/[()]/g, ' ')
            .trim()
            .replace(/\s/g, '_')

         if (/^\d/.test(key)) {
            key = key.split('_').reverse().join('_')
         }
      } catch (error) {
         continue
      }
      keys.push(key)
   }
}

// to prevent lazy loading elements (actually it was a headache to find a proper solution)
const scrollDown = async (page) => {
   await page.evaluate(async () => {
      await new Promise((resolve) => {
         let totalHeight = 0
         const distance = 100
         const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight
            window.scrollBy(0, distance)
            totalHeight += distance

            if (totalHeight - 500 >= scrollHeight) {
               clearInterval(timer)
               resolve()
            }
         }, 5)
      })
   })
}

const write = (array) => {
   fs.writeFile('cryptocoins.json', JSON.stringify(array, null, 4), () => {
      console.log('\n-- File ready --')
   })
}

scrapper(URL)
