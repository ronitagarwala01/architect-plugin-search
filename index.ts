/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { exists } from './paths'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { launch } from './run.js'
import type { LocalOpenSearch } from './run.js'
import { populate } from './data.js'
import {
  cloudformationResources as serverlessCloudformationResources,
  services as serverlessServices,
} from './serverless.js'
import {
  cloudformationResources as serviceCloudformationResources,
  services as serviceServices,
} from './service.js'

/**
 * Convert a string to a suitable name for an OpenSearch Serverless collection.
 *
 * See valid name criteria at
 * https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-manage.html#serverless-create
 */
function toCollectionName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .padEnd(3, '-')
    .slice(0, 32)
}

const openSearchApiFile = 'openSearchApi.js'

async function call_API(cwd: string) {
  //Load api call file and run all api calls to cluster
  const api_path = join(cwd, openSearchApiFile)
  let result
  if (await exists(api_path)) {
    console.log(`Found ${openSearchApiFile} file, deploying ML model`)
    result = (await import(pathToFileURL(api_path).toString())).default

    //result should be a function that returns a promise
    if (typeof result === 'function') {
      result = result()
    }

    //wait for the returned promise to resolve and thus all api calls to complete
    if (result instanceof Promise) {
      await result
    }
  } else {
    console.log(`No ${openSearchApiFile} file found.`)
  }
}

export const deploy = {
  // @ts-expect-error: The Architect plugins API has no type definitions.
  start({ cloudformation, inventory, arc, stage }) {
    let resources
    if (arc.search) {
      resources = serviceCloudformationResources(Object.fromEntries(arc.search))
    } else {
      const { app } = inventory.inv
      const collectionName = toCollectionName(`${app}-${stage}`)
      resources = serverlessCloudformationResources(collectionName)
    }
    Object.assign(cloudformation.Resources, resources)
    return cloudformation
  },
  // @ts-expect-error: The Architect plugins API has no type definitions.
  services({ stage, arc }) {
    if (stage !== 'production') {
      return { node: 'http://localhost:9200' }
    } else if (arc.search) {
      return serviceServices
    } else {
      return serverlessServices
    }
  },
  // @ts-expect-error: The Architect plugins API has no type definitions.
  async end({ inventory }) {
    call_API(inventory.inv._project.cwd)
  },
}

let local: LocalOpenSearch

export const sandbox = {
  async start({
    inventory: {
      inv: {
        // @ts-expect-error: The Architect plugins API has no type definitions.
        _project: { cwd },
      },
    },
  }) {
    local = await launch({})
    await call_API(cwd)
    await populate(cwd, { node: local.url })
  },

  async end() {
    await local.stop()
  },
}
