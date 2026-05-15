import { FormEvent, useEffect, useMemo, useState } from 'react';

import { useLocalDbSnapshot } from '@/local-db/hooks/useLocalDbSnapshot';
import {
  type AppDataClient,
  type AppDataSnapshot,
  type AppId,
  type Layer,
  type LayerKind,
  type Project,
} from '@/local-db/domain/types';

import './LocalDbDemoPage.css';

const LAYER_OPTIONS: Array<{
  kind: LayerKind;
  label: string;
  color: string;
}> = [
  { kind: 'research', label: 'Research', color: '#2563eb' },
  { kind: 'source', label: 'Source', color: '#059669' },
  { kind: 'synthesis', label: 'Synthesis', color: '#c2410c' },
];

const formatTime = (value: number) =>
  new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(value);

const getProjectLayers = (layers: Layer[], projectId: AppId) =>
  layers
    .filter((layer) => layer.projectId === projectId)
    .sort((a, b) => a.position - b.position);

type AppDataDemoPageProps = {
  autoSeedWhenEmpty?: boolean;
  client: AppDataClient;
  eyebrow: string;
  isLoading: boolean;
  resetLabel?: string;
  snapshot: AppDataSnapshot;
  summary: string;
  title: string;
};

type ProjectListProps = {
  projects: Project[];
  selectedProjectId: AppId | null;
  onSelectProject: (projectId: AppId) => void;
};

const ProjectList = ({
  projects,
  selectedProjectId,
  onSelectProject,
}: ProjectListProps) => (
  <div className="localdb-project-list">
    {projects.map((project) => (
      <button
        className={`localdb-project-card ${
          project.id === selectedProjectId ? 'localdb-project-card-active' : ''
        }`}
        key={project.id}
        onClick={() => onSelectProject(project.id)}
        type="button"
      >
        <span className="localdb-card-title">{project.name}</span>
        <span className="localdb-card-text">
          {project.summary || 'No summary yet'}
        </span>
        <span className="localdb-card-text">
          {project.status} · updated {formatTime(project.updatedAt)}
        </span>
      </button>
    ))}
  </div>
);

export const AppDataDemoPage = ({
  autoSeedWhenEmpty = false,
  client,
  eyebrow,
  isLoading,
  resetLabel = 'Reset demo',
  snapshot,
  summary,
  title,
}: AppDataDemoPageProps) => {
  const [selectedProjectId, setSelectedProjectId] = useState<AppId | null>(
    null,
  );
  const [projectName, setProjectName] = useState('');
  const [projectSummary, setProjectSummary] = useState('');
  const [layerName, setLayerName] = useState('');
  const [layerKind, setLayerKind] = useState<LayerKind>('research');
  const [noteLayerId, setNoteLayerId] = useState<AppId>('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [exportedJson, setExportedJson] = useState('');

  const selectedProject = useMemo(
    () =>
      snapshot.projects.find((project) => project.id === selectedProjectId) ??
      snapshot.projects[0] ??
      null,
    [selectedProjectId, snapshot.projects],
  );

  const projectLayers = useMemo(
    () =>
      selectedProject === null
        ? []
        : getProjectLayers(snapshot.layers, selectedProject.id),
    [selectedProject, snapshot.layers],
  );

  useEffect(() => {
    if (autoSeedWhenEmpty && !isLoading && snapshot.projects.length === 0) {
      void client.resetDemo();
    }
  }, [autoSeedWhenEmpty, client, isLoading, snapshot.projects.length]);

  useEffect(() => {
    if (selectedProject !== null && selectedProject.id !== selectedProjectId) {
      setSelectedProjectId(selectedProject.id);
    }
  }, [selectedProject, selectedProjectId]);

  useEffect(() => {
    if (
      projectLayers.length > 0 &&
      !projectLayers.some((layer) => layer.id === noteLayerId)
    ) {
      setNoteLayerId(projectLayers[0].id);
    }
  }, [noteLayerId, projectLayers]);

  const handleCreateProject = async (event: FormEvent) => {
    event.preventDefault();

    if (projectName.trim().length === 0) {
      return;
    }

    const project = await client.projects.create({
      name: projectName,
      summary: projectSummary,
    });

    setSelectedProjectId(project.id);
    setProjectName('');
    setProjectSummary('');
  };

  const handleCreateLayer = async (event: FormEvent) => {
    event.preventDefault();

    if (selectedProject === null || layerName.trim().length === 0) {
      return;
    }

    const option = LAYER_OPTIONS.find((item) => item.kind === layerKind);

    await client.layers.create({
      projectId: selectedProject.id,
      name: layerName,
      kind: layerKind,
      color: option?.color ?? '#2563eb',
    });

    setLayerName('');
  };

  const handleCreateNote = async (event: FormEvent) => {
    event.preventDefault();

    if (
      selectedProject === null ||
      noteLayerId.length === 0 ||
      noteTitle.trim().length === 0
    ) {
      return;
    }

    await client.notes.create({
      projectId: selectedProject.id,
      layerId: noteLayerId,
      title: noteTitle,
      body: noteBody,
    });

    setNoteTitle('');
    setNoteBody('');
  };

  const handleExport = async () => {
    setExportedJson(JSON.stringify(await client.exportAll(), null, 2));
  };

  const selectedProjectNotes =
    selectedProject === null
      ? []
      : snapshot.notes.filter((note) => note.projectId === selectedProject.id);

  return (
    <main className="localdb-page">
      <div className="localdb-shell">
        <header className="localdb-header">
          <div>
            <p className="localdb-eyebrow">{eyebrow}</p>
            <h1 className="localdb-title">{title}</h1>
            <p className="localdb-summary">{summary}</p>
          </div>
          <div className="localdb-actions">
            <button
              className="localdb-button"
              onClick={handleExport}
              type="button"
            >
              Export JSON
            </button>
            <button
              className="localdb-button localdb-button-primary"
              onClick={() => void client.resetDemo()}
              type="button"
            >
              {resetLabel}
            </button>
          </div>
        </header>

        <section className="localdb-architecture" aria-label="Architecture">
          {[
            ['UI', 'React page calls project, layer, and note commands.'],
            ['Domain API', 'AppDataClient owns the app-facing contract.'],
            ['Dexie adapter', 'IndexedDB tables mirror future Convex indexes.'],
            ['Convex adapter', 'Future online adapter keeps app IDs as appId.'],
          ].map(([title, body]) => (
            <div className="localdb-architecture-step" key={title}>
              <h2 className="localdb-panel-title">{title}</h2>
              <p className="localdb-panel-subtitle">{body}</p>
            </div>
          ))}
        </section>

        <section className="localdb-grid">
          <aside className="localdb-panel">
            <div className="localdb-panel-header">
              <h2 className="localdb-panel-title">Projects</h2>
              <p className="localdb-panel-subtitle">
                App-level string IDs are used locally and can become Convex
                appId fields later.
              </p>
            </div>
            <div className="localdb-panel-body">
              <form className="localdb-form" onSubmit={handleCreateProject}>
                <input
                  className="localdb-input"
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="Project name"
                  value={projectName}
                />
                <textarea
                  className="localdb-textarea"
                  onChange={(event) => setProjectSummary(event.target.value)}
                  placeholder="Summary"
                  value={projectSummary}
                />
                <button
                  className="localdb-button localdb-button-primary"
                  type="submit"
                >
                  <span aria-hidden>+</span> Add project
                </button>
              </form>
              <ProjectList
                onSelectProject={setSelectedProjectId}
                projects={snapshot.projects}
                selectedProjectId={selectedProject?.id ?? null}
              />
            </div>
          </aside>

          <section className="localdb-panel">
            <div className="localdb-panel-header">
              <div className="localdb-toolbar">
                <div>
                  <h2 className="localdb-panel-title">
                    {selectedProject?.name ?? 'No project selected'}
                  </h2>
                  <p className="localdb-panel-subtitle">
                    {projectLayers.length} layers ·{' '}
                    {selectedProjectNotes.length} notes · backing store:{' '}
                    {client.mode}
                  </p>
                </div>
                {selectedProject !== null && (
                  <button
                    className="localdb-icon-button"
                    onClick={() =>
                      void client.projects.delete(selectedProject.id)
                    }
                    title="Delete project"
                    type="button"
                  >
                    <span aria-hidden>x</span>
                  </button>
                )}
              </div>
            </div>
            <div className="localdb-panel-body">
              <form className="localdb-form" onSubmit={handleCreateLayer}>
                <input
                  className="localdb-input"
                  onChange={(event) => setLayerName(event.target.value)}
                  placeholder="Layer name"
                  value={layerName}
                />
                <select
                  className="localdb-select"
                  onChange={(event) =>
                    setLayerKind(event.target.value as LayerKind)
                  }
                  value={layerKind}
                >
                  {LAYER_OPTIONS.map((option) => (
                    <option key={option.kind} value={option.kind}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button className="localdb-button" type="submit">
                  <span aria-hidden>+</span> Add layer
                </button>
              </form>

              <form className="localdb-form" onSubmit={handleCreateNote}>
                <select
                  className="localdb-select"
                  onChange={(event) => setNoteLayerId(event.target.value)}
                  value={noteLayerId}
                >
                  {projectLayers.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name}
                    </option>
                  ))}
                </select>
                <input
                  className="localdb-input"
                  onChange={(event) => setNoteTitle(event.target.value)}
                  placeholder="Note title"
                  value={noteTitle}
                />
                <textarea
                  className="localdb-textarea"
                  onChange={(event) => setNoteBody(event.target.value)}
                  placeholder="Note body"
                  value={noteBody}
                />
                <button
                  className="localdb-button localdb-button-primary"
                  type="submit"
                >
                  <span aria-hidden>+</span> Add note
                </button>
              </form>

              <div className="localdb-board">
                {projectLayers.map((layer) => {
                  const layerNotes = selectedProjectNotes.filter(
                    (note) => note.layerId === layer.id,
                  );

                  return (
                    <article className="localdb-column" key={layer.id}>
                      <div className="localdb-column-header">
                        <div className="localdb-layer-heading">
                          <span
                            className="localdb-swatch"
                            style={{ backgroundColor: layer.color }}
                          />
                          <span className="localdb-layer-name">
                            {layer.name}
                          </span>
                        </div>
                        <button
                          className="localdb-icon-button"
                          onClick={() => void client.layers.delete(layer.id)}
                          title="Delete layer"
                          type="button"
                        >
                          <span aria-hidden>x</span>
                        </button>
                      </div>
                      <div className="localdb-note-list">
                        {layerNotes.map((note) => (
                          <article className="localdb-note" key={note.id}>
                            <div className="localdb-toolbar">
                              <h3 className="localdb-note-title">
                                {note.title}
                              </h3>
                              <button
                                className="localdb-icon-button"
                                onClick={() =>
                                  void client.notes.delete(note.id)
                                }
                                title="Delete note"
                                type="button"
                              >
                                <span aria-hidden>x</span>
                              </button>
                            </div>
                            <p className="localdb-note-body">{note.body}</p>
                            <span className="localdb-note-meta">
                              {note.id} · {formatTime(note.updatedAt)}
                            </span>
                          </article>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        </section>

        {exportedJson.length > 0 && (
          <section className="localdb-panel">
            <div className="localdb-panel-header">
              <h2 className="localdb-panel-title">Dexie export payload</h2>
              <p className="localdb-panel-subtitle">
                This is the shape a future Convex import mutation can accept.
              </p>
            </div>
            <pre className="localdb-code">{exportedJson}</pre>
          </section>
        )}
      </div>
    </main>
  );
};

export const LocalDbDemoPage = () => {
  const workspace = useLocalDbSnapshot();

  return (
    <AppDataDemoPage
      {...workspace}
      autoSeedWhenEmpty
      eyebrow="Dexie now, Convex later"
      resetLabel="Reset demo"
      summary="This page stores projects, layers, and notes in IndexedDB through Dexie, but React only talks to an AppDataClient. The same command surface is used by the Convex-backed route."
      title="LocalDB research workspace"
    />
  );
};
