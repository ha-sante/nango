import { expect, describe, it, beforeAll, afterAll } from 'vitest';
import { multipleMigrations } from '../../db/database.js';
import * as DataService from './data.service.js';
import { formatDataRecords, getDataRecords } from './data-records.service.js';
import connectionService from '../connection.service.js';
import { create as createConfigs, deleteAll as deleteConfigs } from '../../db/seeders/config.seeder.js';
import { create as createConnections, deleteAll as deleteConnections } from '../../db/seeders/connection.seeder.js';
import { create as createSync, deleteAll as deleteSyncs } from '../../db/seeders/sync.seeder.js';
import { create as createSyncJob, deleteAll as deleteSyncJobs } from '../../db/seeders/sync-job.seeder.js';
import type { DataRecord, DataRecordWithMetadata } from '../../models/Sync.js';

describe('Data service integration tests', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await createConfigs();
    });

    it('Should insert records properly and retrieve', async () => {
        const connections = await createConnections();

        const duplicateRecords = [
            {
                id: '1',
                name: 'John Doe'
            },
            {
                id: '1',
                name: 'John Doe'
            },
            {
                id: '2',
                name: 'Jane Doe'
            },
            {
                id: '2',
                name: 'Jane Doe'
            },
            {
                id: '3',
                name: 'John Doe'
            },
            {
                id: '3',
                name: 'John Doe'
            },
            { id: '4', name: 'Mike Doe' },
            { id: '5', name: 'Mike Doe' }
        ];
        const sync = await createSync(connections[0]);
        const job = await createSyncJob(connections[0]);
        const modelName = Math.random().toString(36).substring(7);
        const { response: formattedResults } = formatDataRecords(duplicateRecords, connections[0] as number, modelName, sync.id as string, job.id as number);
        const { error, success } = await DataService.upsert(
            formattedResults as unknown as DataRecord[],
            '_nango_sync_data_records',
            'external_id',
            1,
            modelName,
            job.id as number
        );
        expect(success).toBe(true);
        expect(error).toBe(undefined);

        const expectedRecords = [
            { id: '5', name: 'Mike Doe' },
            { id: '4', name: 'Mike Doe' },
            { id: '3', name: 'John Doe' },
            { id: '2', name: 'Jane Doe' },
            { id: '1', name: 'John Doe' }
        ];

        const connection = await connectionService.getConnectionById(connections[0] as number);
        const { response: records } = await getDataRecords(connection?.connection_id as string, connection?.provider_config_key as string, 1, modelName);
        expect(records?.length).toBe(5);
        expect(records).toEqual(expectedRecords);

        const { response: ascRecords } = await getDataRecords(
            connection?.connection_id as string,
            connection?.provider_config_key as string,
            1,
            modelName,
            undefined, // delta
            undefined, // offset
            undefined, // limit
            undefined, // sortBy
            'asc'
        );

        expect(ascRecords).toEqual(expectedRecords.reverse());

        const { response: metaRecords } = await getDataRecords(
            connection?.connection_id as string,
            connection?.provider_config_key as string,
            1,
            modelName,
            undefined, // delta
            undefined, // offset
            undefined, // limit
            undefined, // sortBy
            undefined, // order
            undefined, // filter
            true // include metadata
        );

        for (const metaRecord of metaRecords as DataRecordWithMetadata[]) {
            expect(metaRecord).toHaveProperty('first_seen_at');
            expect(metaRecord).toHaveProperty('last_modified_at');

            expect(metaRecord.last_action).toBe('ADDED');
        }
    });

    afterAll(async () => {
        await deleteConnections();
        await deleteConfigs();
        await deleteSyncs();
        await deleteSyncJobs();
    });
});
