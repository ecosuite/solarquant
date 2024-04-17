import axios from 'axios';
import { Table } from 'console-table-printer';
import { SimpleChannel } from 'channel-ts';
import { readConfigFile, AMSConfig } from './config.js';
import cliProgress, { MultiBar } from 'cli-progress'
import { exit } from 'process';

export interface I2xOptions {
  project: string
}

async function get_codes_arr(cfg: AMSConfig): Promise<string[]> {
  const response = await axios.get(
    `${cfg.url}/projects`,
    { headers: { Authorization: cfg.session, 'Accept-Encoding': 'UTF8' } })

  const data = response.data['projects']
  return data.map((project: any) => project.code)
}

async function raw_i2x(cfg: AMSConfig, project: string, start: string, end: string): Promise<object> {
  const response = await axios.get(
    `${cfg.url}/projects/${project}/i2x?startDate=${start}&endDate=${end}`,
    { headers: { Authorization: cfg.session, 'Accept-Encoding': 'UTF8' } })

  const data = response.data['i2x']
  return data
}

function chunkArray<T>(arr: T[], n: number): T[][] {
  const chunkLength = Math.max(arr.length / n, 1);
  const chunks = [];
  for (let i = 0; i < n; i++) {
    if (chunkLength * (i + 1) <= arr.length)
      chunks.push(arr.slice(chunkLength * i, chunkLength * (i + 1)));
  }
  return chunks;
}

export async function i2x(start: string, end: string, opts: I2xOptions): Promise<void> {
  const cfg = readConfigFile()

  if (!cfg.ams?.session) {
    throw new Error('Must have active Ecosuite authentication')
  }

  try {
    const bar = new cliProgress.MultiBar(
      {
        etaBuffer: 64,
        clearOnComplete: true,
        hideCursor: true,
        format: ' {bar} | {index} | {value}/{total}',
        forceRedraw: true,
      },
      cliProgress.Presets.rect)

    let codes = []
    if (opts.project) {
      codes.push(opts.project)
    } else {
      codes = await get_codes_arr(cfg.ams)
    }

    const chan = new SimpleChannel<any>();
    const groups = chunkArray(codes, 16)

    let producer = async (codes: string[], chan: SimpleChannel<any>) => {
      if (!codes) {
        return
      }

      let total = 0
      const b = bar.create(codes.length, 0, {}, {
        format: ' {bar} | {last}',
      })

      for (const code of codes) {
        b.update(total, { last: code })

        try {
          const data = await raw_i2x(cfg.ams as AMSConfig, code, start, end)
          chan.send({
            "code": code,
            "data": data,
          })
        } catch (e) { }

        total += 1
        b.update(total, { last: code })
      }

      bar.remove(b)
    }

    let consumer = async (chan: SimpleChannel<any>) => {
      const b = bar.create(codes.length, 0, {}, {
        format: ' {bar} | Total Progress: {value}/{total} | {eta_formatted}',
        forceRedraw: true,
        noTTYOutput: true
      })

      let outputObject: any = {}

      for await (const next of chan) {
        b.increment()
        outputObject[next.code] = next.data
      }

      console.log(JSON.stringify(outputObject, null, 4))

      bar.remove(b)
    }

    const p1 = consumer(chan)
    const p2 = Array.from(Array(16).keys())
      .map(
        async i => producer(groups[i], chan))

    await Promise.all(p2)
    chan.close()

    bar.stop()
    await p1

    exit(0)
  } catch (e) {
    if (e instanceof axios.AxiosError) {
      if (e.response?.status != 200) {
        if (e.response?.status == 401) {
          console.error(
            'The AMS API rejected your authenticated session. Please authenticate again.')
          return
        }

        throw new Error(
          `Failed to fetch export data, code: ${e.response?.status}`)
      }
    } else {
      throw e
    }
  }
}

export async function listAMSProjects(codes: boolean): Promise<void> {
  const cfg = readConfigFile()

  if (!cfg.ams?.session) {
    throw new Error('Must have active Ecosuite authentication')
  }

  try {
    const response = await axios.get(
      `${cfg.ams.url}/projects`,
      { headers: { Authorization: cfg.ams.session, 'Accept-Encoding': 'UTF8' } })

    const fields =
      [
        'status',
        'name',
        'state',
        'code',
        'town',
      ]

    const resp = response.data
    const p = new Table({
      columns: fields.map(f => {
        return {
          name: f, alignment: 'left'
        }
      }),
      rows: resp['projects'].map((p: any) => {
        if (codes) {
          return
        }

        let v: any = {};
        for (const f of fields) {
          v[f] = p[f]
        }

        return v
      })
    })

    p.printTable()
  } catch (e) {
    if (e instanceof axios.AxiosError) {
      if (e.response?.status != 200) {
        if (e.response?.status == 401) {
          console.error(
            'The AMS API rejected your authenticated session. Please authenticate again.')
          return
        }

        throw new Error(
          `Failed to fetch export data, code: ${e.response?.status}`)
      }
    } else {
      throw e
    }
  }
}

export async function listAMSSites(project: string): Promise<void> {
  const cfg = readConfigFile()

  if (!cfg.ams?.session) {
    throw new Error('Must have active AMS authentication')
  }

  try {
    const response = await axios.get(
      `${cfg.ams.url}/projects`,
      { headers: { Authorization: cfg.ams.session, 'Accept-Encoding': 'UTF8' } })

    if (response.status != 200) {
      if (response.status == 401) {
        console.error(
          'The AMS API rejected your authenticated session. Please authenticate again.')
        return
      }

      throw new Error(`Failed to fetch export data, code: ${response.status}, message: ${response.statusText}`)
    }

    const r = await response.data
    const p = r['projects'].find((c: any) => c['code'] == project)
    const sites = p['sites']

    Object.keys(sites).forEach((key: string) => {
      console.log(key)
    })
  } catch (e) {
    if (e instanceof axios.AxiosError) {
      if (e.response?.status != 200) {
        if (e.response?.status == 401) {
          console.error(
            'The AMS API rejected your authenticated session. Please authenticate again.')
          return
        }

        throw new Error(
          `Failed to fetch export data, code: ${e.response?.status}`)
      }
    } else {
      throw e
    }
  }
}

export async function listAMSSources(
  project: string, site: string): Promise<void> {
  const cfg = readConfigFile()

  if (!cfg.ams?.session) {
    throw new Error('Must have active AMS authentication')
  }

  try {
    const response = await axios.get(
      `${cfg.ams.url}/projects`,
      { headers: { Authorization: cfg.ams.session, 'Accept-Encoding': 'UTF8' } })

    if (response.status != 200) {
      if (response.status == 401) {
        console.error(
          'The AMS API rejected your authenticated session. Please authenticate again.')
        return
      }

      throw new Error(`Failed to fetch export data, code: ${response.status}, message: ${response.statusText}`)
    }

    const r = await response.data
    const p = r['projects'].find((c: any) => c['code'] == project)
    const s: any[] = Object.values(p['sites'][site]['systems'])

    let output: any = {};
    for (const system of s) {
      const code: string = system['code']
      output[code] = system['devices']
    }

    console.log(JSON.stringify(output, null, 4))
  } catch (e) {
    if (e instanceof axios.AxiosError) {
      if (e.response?.status != 200) {
        if (e.response?.status == 401) {
          console.error(
            'The AMS API rejected your authenticated session. Please authenticate again.')
          return
        }

        throw new Error(
          `Failed to fetch export data, code: ${e.response?.status}`)
      }
    } else {
      throw e
    }
  }
}

export async function listEvents(start: string, end: string): Promise<void> {
  const cfg = readConfigFile()

  if (!cfg.ams?.session) {
    throw new Error('Must have active AMS authentication')
  }

  try {
    const response = await axios.get(
      `${cfg.ams.url}/events?start=${start}&end=${end}`,
      { headers: { Authorization: cfg.ams.session, 'Accept-Encoding': 'UTF8' } })

    if (response.status != 200) {
      if (response.status == 401) {
        console.error(
          'The AMS API rejected your authenticated session. Please authenticate again.')
        return
      }

      throw new Error(`Failed to fetch export data, code: ${response.status}, message: ${response.statusText}`)
    }

    const json = await response.data
    const events = json['events']

    const properties =
      [
        'path', 'assetType', 'dueDate', 'userName', 'priority', 'updated',
        'userId', 'startDate', 'description', 'id', 'cause', 'type'
      ]

    for (let i = 0; i < properties.length; i++) {
      process.stdout.write(properties[i])
      process.stdout.write(i == (properties.length - 1) ? '\n' : ',')
    }

    for (const event of events) {
      for (let i = 0; i < properties.length; i++) {
        const p = properties[i];
        if (event[p]) {
          let str = event[p].toString()
          str = str.replace(/\n/g, '\\n')
          str = str.replace(/\r/g, '\\r')
          str = str.replace(/,/g, '\\,')
          process.stdout.write(str)
        }
        process.stdout.write(i == (properties.length - 1) ? '\n' : ',')
      }
    }
  } catch (e) {
    if (e instanceof axios.AxiosError) {
      if (e.response?.status != 200) {
        if (e.response?.status == 401) {
          console.error(
            'The AMS API rejected your authenticated session. Please authenticate again.')
          return
        }

        throw new Error(
          `Failed to fetch export data, code: ${e.response?.status}`)
      }
    } else {
      throw e
    }
  }
}
