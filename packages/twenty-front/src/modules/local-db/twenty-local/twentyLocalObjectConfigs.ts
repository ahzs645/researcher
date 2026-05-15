export type TwentyLocalDataMode = 'local' | 'convex';

export type TwentyLocalObjectNamePlural = 'companies' | 'notes' | 'tasks';

export type TwentyLocalObjectConfig = {
  objectNamePlural: TwentyLocalObjectNamePlural;
  objectNameSingular: string;
  defaultViewId: string;
  preferredFieldNames: readonly string[];
};

export const twentyLocalObjectConfigs = [
  {
    objectNamePlural: 'companies',
    objectNameSingular: 'company',
    defaultViewId: '54b1698a-ffa9-4e94-b8c0-eb326884429f',
    preferredFieldNames: [
      'name',
      'domainName',
      'employees',
      'tagline',
      'updatedAt',
    ],
  },
  {
    objectNamePlural: 'notes',
    objectNameSingular: 'note',
    defaultViewId: 'a2e8fcd2-53c0-41e5-a433-95b00f565ca3',
    preferredFieldNames: ['title', 'bodyV2', 'updatedAt', 'createdAt'],
  },
  {
    objectNamePlural: 'tasks',
    objectNameSingular: 'task',
    defaultViewId: 'a3a0aec8-388a-4147-b853-ddb75245f7fa',
    preferredFieldNames: ['title', 'status', 'bodyV2', 'updatedAt'],
  },
] as const satisfies readonly TwentyLocalObjectConfig[];

export const defaultTwentyLocalObjectConfig = twentyLocalObjectConfigs[0];

export const getTwentyLocalObjectConfigByObjectNamePlural = (
  objectNamePlural: string | undefined,
) =>
  twentyLocalObjectConfigs.find(
    (config) => config.objectNamePlural === objectNamePlural,
  );

export const getTwentyLocalObjectConfigByObjectNameSingular = (
  objectNameSingular: string | undefined,
) =>
  twentyLocalObjectConfigs.find(
    (config) => config.objectNameSingular === objectNameSingular,
  );

export const getTwentyLocalObjectConfigByObjectRoutePath = (pathname: string) =>
  twentyLocalObjectConfigs.find(
    (config) => pathname === `/objects/${config.objectNamePlural}`,
  );

export const getTwentyLocalObjectRoutePath = ({
  dataMode,
  objectNamePlural,
}: {
  dataMode: TwentyLocalDataMode;
  objectNamePlural: TwentyLocalObjectNamePlural;
}) => {
  const config = getTwentyLocalObjectConfigByObjectNamePlural(objectNamePlural);

  if (config === undefined) {
    return `/objects/${defaultTwentyLocalObjectConfig.objectNamePlural}?localdb=1&viewId=${defaultTwentyLocalObjectConfig.defaultViewId}`;
  }

  const modeSearchParam = dataMode === 'local' ? 'localdb=1' : 'data=convex';

  return `/objects/${config.objectNamePlural}?${modeSearchParam}&viewId=${config.defaultViewId}`;
};

export const getTwentyLocalRecordRoutePath = ({
  dataMode,
  objectNamePlural,
  objectRecordId,
}: {
  dataMode: TwentyLocalDataMode;
  objectNamePlural: TwentyLocalObjectNamePlural;
  objectRecordId: string;
}) => {
  const config = getTwentyLocalObjectConfigByObjectNamePlural(objectNamePlural);

  if (config === undefined) {
    return getTwentyLocalObjectRoutePath({
      dataMode,
      objectNamePlural: defaultTwentyLocalObjectConfig.objectNamePlural,
    });
  }

  const modeSearchParam = dataMode === 'local' ? 'localdb=1' : 'data=convex';

  return `/object/${config.objectNameSingular}/${objectRecordId}?${modeSearchParam}`;
};
