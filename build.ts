import { join as pathJoin } from 'path';
import { promises as fs } from 'fs';
import cheerio from 'cheerio';
import type { Cheerio, CheerioAPI, Element } from 'cheerio';
import fetch from 'node-fetch';

interface Country {
  code: string;
  name: string;
  rate: number;
}

interface Data {
  updatedAt: string;
  data: Country | Array<Country>;
}

const URL =
  'https://ec.europa.eu/taxation_customs/business/vat/telecommunications-broadcasting-electronic-services/vat-rates_en';

const DIST = pathJoin(__dirname, 'dist');

const API = pathJoin(DIST, 'api');

const STATIC = pathJoin(__dirname, 'static');

const COUNTRIES_TO_ABBR = {
  Austria: 'AT',
  Belgium: 'BE',
  Bulgaria: 'BG',
  Croatia: 'HR',
  Cyprus: 'CY',
  'Czech Republic': 'CZ',
  Denmark: 'DK',
  Estonia: 'EE',
  Finland: 'FI',
  France: 'FR',
  Germany: 'DE',
  Greece: 'EL',
  Hungary: 'HU',
  Ireland: 'IE',
  Italy: 'IT',
  Latvia: 'LV',
  Lithuania: 'LT',
  Luxembourg: 'LU',
  Malta: 'MT',
  Netherlands: 'NL',
  Poland: 'PL',
  Portugal: 'PT',
  Romania: 'RO',
  Slovakia: 'SK',
  Slovenia: 'SI',
  Spain: 'ES',
  Sweden: 'SE',
  'United Kingdom': 'UK',
};

function getFirstTextNodes(
  $: CheerioAPI,
  $element: Cheerio<Element>
): Array<string> {
  return $element
    .map((_, el) => {
      return $(el).contents().slice(0, 1).text().trim();
    })
    .toArray();
}

function getCountryShortCode(countryName: string): string {
  if (!(countryName in COUNTRIES_TO_ABBR)) {
    throw new Error(`Got invalid country ${countryName}`);
  }
  return COUNTRIES_TO_ABBR[countryName];
}

function withTimestamp(
  updatedAt: string,
  data: Country | Array<Country>
): Data {
  return { updatedAt, data };
}

function createCountryFiles(
  now: string,
  countries: Array<Country>
): Array<Promise<void>> {
  return countries.map((country) => {
    const data = JSON.stringify(withTimestamp(now, country), null, 2);

    return fs.writeFile(
      pathJoin(API, `${country.code.toLowerCase()}.json`),
      data
    );
  });
}

function writeRedirects(
  file: string,
  countries: Array<Country>
): Promise<void> {
  const data = [
    file,
    ...countries.map(
      ({ code }) =>
        `/api/${code.toLowerCase()}    /api/${code.toLowerCase()}.json 200!`
    ),
  ];

  return fs.writeFile(pathJoin(DIST, '_redirects'), data.join('\n'));
}

async function writeData(html: string): Promise<void> {
  const now = new Date().toISOString();
  const $ = cheerio.load(html);
  const $rows = $('table.table-vat-rates tbody tr');
  const countries = getFirstTextNodes($, $rows.find('td:first-child'));
  const rates = getFirstTextNodes($, $rows.find('td:nth-child(2)'));

  if (countries.length !== rates.length) {
    throw new Error('Fetched more/less countries than rates.');
  }

  const data = Array.from(
    { length: countries.length },
    (_, i): Country => ({
      code: getCountryShortCode(countries[i]),
      name: countries[i],
      rate: Number(rates[i]),
    })
  );
  const redirects = await fs.readFile(pathJoin(STATIC, '_redirects'), 'utf8');

  await fs.mkdir(API, { recursive: true });
  await Promise.all([
    fs.writeFile(
      pathJoin(API, 'all.json'),
      JSON.stringify(withTimestamp(now, data), null, 2)
    ),
    writeRedirects(redirects, data),
    ...createCountryFiles(now, data),
  ]);
}

fetch(URL)
  .then((response) => response.text())
  .then(writeData)
  .catch((error) => {
    console.log('Could not write files.');
    console.log(error);
  });
