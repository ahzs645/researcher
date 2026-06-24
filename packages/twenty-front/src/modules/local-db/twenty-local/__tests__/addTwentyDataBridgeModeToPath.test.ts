import { addTwentyDataBridgeModeToPath } from '@/local-db/twenty-local/addTwentyDataBridgeModeToPath';
import { getTwentyDataMode } from '@/local-db/twenty-local/isLocalTwentyDataMode';

jest.mock('@/local-db/twenty-local/isLocalTwentyDataMode', () => ({
  getTwentyDataMode: jest.fn(),
}));

const mockedGetTwentyDataMode = jest.mocked(getTwentyDataMode);

describe('addTwentyDataBridgeModeToPath', () => {
  beforeEach(() => {
    mockedGetTwentyDataMode.mockReset();
  });

  it('leaves paths untouched outside bridge mode', () => {
    mockedGetTwentyDataMode.mockReturnValue(null);

    expect(
      addTwentyDataBridgeModeToPath(
        '/objects/companies?viewId=company-index-view',
      ),
    ).toBe('/objects/companies?viewId=company-index-view');
  });

  it('adds localdb=1 to object and record paths in local mode', () => {
    mockedGetTwentyDataMode.mockReturnValue('local');

    expect(
      addTwentyDataBridgeModeToPath(
        '/objects/notes?viewId=note-index-view#table',
      ),
    ).toBe('/objects/notes?viewId=note-index-view&localdb=1#table');
    expect(addTwentyDataBridgeModeToPath('/object/note/note-1')).toBe(
      '/object/note/note-1?localdb=1',
    );
  });

  it('adds data=convex to object and record paths in Convex mode', () => {
    mockedGetTwentyDataMode.mockReturnValue('convex');

    expect(
      addTwentyDataBridgeModeToPath(
        '/objects/tasks?viewId=task-index-view&localdb=1',
      ),
    ).toBe('/objects/tasks?viewId=task-index-view&data=convex');
    expect(addTwentyDataBridgeModeToPath('/object/task/task-1?localdb=1')).toBe(
      '/object/task/task-1?data=convex',
    );
  });

  it('preserves bridge mode on research and repurposed CRM object paths', () => {
    mockedGetTwentyDataMode.mockReturnValue('local');

    expect(addTwentyDataBridgeModeToPath('/objects/people?viewId=people')).toBe(
      '/objects/people?viewId=people&localdb=1',
    );
    expect(addTwentyDataBridgeModeToPath('/object/person/person-1')).toBe(
      '/object/person/person-1?localdb=1',
    );
    expect(
      addTwentyDataBridgeModeToPath('/objects/researchTeams?viewId=teams'),
    ).toBe('/objects/researchTeams?viewId=teams&localdb=1');
  });

  it('leaves non-object paths untouched', () => {
    mockedGetTwentyDataMode.mockReturnValue('local');

    expect(addTwentyDataBridgeModeToPath('/settings/profile')).toBe(
      '/settings/profile',
    );
  });
});
