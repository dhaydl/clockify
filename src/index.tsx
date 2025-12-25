import {
  ActionPanel,
  Form,
  Icon,
  List,
  showToast,
  useNavigation,
  Toast,
  Action,
  LocalStorage,
  openExtensionPreferences,
  getPreferenceValues
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import isEmpty from "lodash.isempty";
import uniqWith from "lodash.uniqwith";
import useConfig from "./useConfig";
import { fetcher, isInProgress, showElapsedTime } from "./utils";
import { TimeEntry, Project, Task, Tag } from "./types";
import { useCachedState } from "@raycast/utils";

function OpenWebPage() {
  return <Action.OpenInBrowser title="Open Website" url="https://app.clockify.me" />;
}

function ToggleTags() {
  const [, setIsShowingTags] = useCachedState<boolean>("show-tags");
  return (
    <Action
      icon={Icon.Tag}
      title="Toggle Tags"
      onAction={() => setIsShowingTags((show) => !show)}
      shortcut={{ modifiers: ["cmd"], key: "t" }}
    />
  );
}

function useClock(entry: TimeEntry) {
  const [time, setTime] = useState(showElapsedTime(entry));

  useEffect(() => {
    const interval = setInterval(() => setTime(showElapsedTime(entry)), 1000);
    return () => clearInterval(interval);
  }, []);

  return time;
}

function ItemInProgress({ entry, updateTimeEntries }: { entry: TimeEntry; updateTimeEntries: () => void }) {
  const [isShowingTags] = useCachedState<boolean>("show-tags");
  const time = useClock(entry);

  return (
    <List.Item
      id={entry.id}
      title={entry.project?.clientName || "No Client"}
      subtitle={`${[entry.description || "No Description", entry.task?.name].filter(Boolean).join(" • ")}`}
      accessories={[
        { text: `${time}  -  ${entry.project?.name}`, icon: { source: Icon.Dot, tintColor: entry.project?.color } },
        ...(isShowingTags ? entry.tags.map((tag) => ({ tag: tag.name })) : []),
      ]}
      icon={{ source: Icon.Clock, tintColor: entry.project?.color }}
      keywords={[...(entry.description?.split(" ") ?? []), ...(entry.project?.name.split(" ") ?? [])]}
      actions={
        <ActionPanel>
          <Action
            icon={Icon.Stop}
            title="Stop Timer"
            onAction={() => stopCurrentTimer().then(() => updateTimeEntries())}
          />
          <OpenWebPage />
          <ToggleTags />
        </ActionPanel>
      }
    />
  );
}

export default function Main() {
  const { config, isValidToken, setIsValidToken } = useConfig();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isShowingTags] = useCachedState<boolean>("show-tags");

  useEffect(() => {
    if (isEmpty(config) || !isValidToken) return;

    async function fetchTimeEntries() {
      setIsLoading(true);

      const storedEntries: string | undefined = await LocalStorage.getItem("entries");
      if (storedEntries) {
        processLoadedTimeEntries(JSON.parse(storedEntries));
      }

      const allEntries = await getTimeEntries({ onError: setIsValidToken });
      processLoadedTimeEntries(allEntries);

      setIsLoading(false);
    }

    fetchTimeEntries();
  }, [config, isValidToken]);

  const updateTimeEntries = useCallback((): void => {
    setIsLoading(true);

    getTimeEntries({ onError: setIsValidToken })
      .then((allEntries) => {
        processLoadedTimeEntries(allEntries);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [getTimeEntries]);

  const format = new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short"
  });

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search time entries">
      {!isValidToken ? (
        <List.Item
          icon={Icon.ExclamationMark}
          title="Invalid API Key Detected"
          accessories={[{ text: `Go to Extensions → Clockify` }]}
          actions={
            <ActionPanel>
              <Action icon={Icon.Gear} title="Open Extension Preferences" onAction={openExtensionPreferences} />
            </ActionPanel>
          }
        />
      ) : (
        <>
          <List.Section title="What are you working on?">
            <List.Item
              icon={{ source: Icon.ArrowRight }}
              title="Start New Timer"
              actions={
                <ActionPanel>
                  <Action.Push
                    icon={Icon.ArrowRight}
                    title="Start New Timer"
                    target={<NewEntry updateTimeEntries={updateTimeEntries} />}
                  />
                  <OpenWebPage />
                </ActionPanel>
              }
            />
            <List.Item 
              icon={{ source: Icon.ArrowRight }}
              title="Create Time Entry"
              actions={
                <ActionPanel>
                  <Action.Push
                    icon={Icon.ArrowRight}
                    title="Create Time Entry"
                    target={<CreateEntry latestTimeEntry={allEntries[0]} />}
                  />
                </ActionPanel>
              }
            />
          </List.Section>
          <List.Section title="Latest entries">
            {entries.map((entry) =>
              isInProgress(entry) ? (
                <ItemInProgress key={entry.id} entry={entry} updateTimeEntries={updateTimeEntries} />
              ) : (
                <List.Item
                  id={entry.id}
                  key={entry.id}
                  title={entry.project?.clientName || "No Client"}
                  subtitle={`${[entry.description || "No Description", entry.task?.name].filter(Boolean).join(" • ")}`}
                  accessories={[
                    ...(getPreferenceValues<Preferences>().groupSameEntries 
                      ? [] : [
                        { text: format.format(new Date(entry.timeInterval.start)) }, 
                        { text: format.format(new Date(entry.timeInterval.end)) }
                      ]
                    ),
                    { text: entry.project?.name, icon: { source: Icon.Dot, tintColor: entry.project?.color } },
                    ...(isShowingTags ? entry.tags.map((tag) => ({ tag: tag.name })) : []),
                  ]}
                  icon={{ source: Icon.Circle, tintColor: entry.project?.color }}
                  keywords={[...(entry.description?.split(" ") ?? []), ...(entry.project?.name.split(" ") ?? [])]}
                  actions={
                    <ActionPanel>
                      <Action
                        icon={Icon.Play}
                        title="Start Timer"
                        onAction={() => {
                          addNewTimeEntry(
                            entry.description,
                            entry.projectId,
                            entry.taskId,
                            entry.tags.map((tag) => tag.id),
                          ).then(() => updateTimeEntries());
                        }}
                      />
                      <OpenWebPage />
                      <ToggleTags />
                    </ActionPanel>
                  }
                />
              ),
            )}
          </List.Section>
        </>
      )}
    </List>
  );

  function processLoadedTimeEntries(entries: TimeEntry[]): void {
    if (entries) {
      setAllEntries(entries);
      LocalStorage.setItem("entries", JSON.stringify(entries));

      setEntries(
        getPreferenceValues<Preferences>().groupSameEntries
          ? uniqWith(
              entries,
              (a: TimeEntry, b: TimeEntry) =>
                a.projectId === b.projectId && a.taskId === b.taskId && a.description === b.description,
            )
          : entries
      );
    }
  }
}

function ProjectDropdown({ setLoadingIndicator }: { setLoadingIndicator: (isLoading: boolean) => void }) {
  const { config } = useConfig();

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (isEmpty(config)) return;

    async function getAllProjectsOnWorkspace(): Promise<void> {
      setLoadingIndicator(true);

      const storedProjects = await LocalStorage.getItem<string>("projects");
      if (storedProjects) setProjects(JSON.parse(storedProjects));

      const projectsResponse = await fetcher(`/workspaces/${config.workspaceId}/projects?page-size=1000&archived=false`);
      setProjects(projectsResponse.data || []);
      LocalStorage.setItem("projects", JSON.stringify(projectsResponse.data));

      setLoadingIndicator(false);
    }

    getAllProjectsOnWorkspace();
  }, [config]);

  return (
    <>
      <Form.Dropdown
        id="projectId"
        title="Project"
        onChange={(projectId) => {
          async function getAllTasksForProject(projectId: string): Promise<void> {
            setLoadingIndicator(true);

            const storedTasks: string | undefined = await LocalStorage.getItem(`project[${projectId}]`);
            if (storedTasks) setTasks(JSON.parse(storedTasks));

            const { data } = await fetcher(
              `/workspaces/${config.workspaceId}/projects/${projectId}/tasks?page-size=1000`,
            );

            setTasks(data || []);
            LocalStorage.setItem(`project[${projectId}]`, JSON.stringify(data));
            setLoadingIndicator(false);
          }

          getAllTasksForProject(projectId);
        }}
      >
        {projects.map((project: Project) => (
          <Form.Dropdown.Item
            key={project.id}
            value={project.id}
            title={`${project.name} - ${project?.clientName || "No Client"}`}
            icon={{ source: Icon.Circle, tintColor: project.color }}
          />
        ))}
      </Form.Dropdown>

      {tasks.length ? (
        <Form.Dropdown id="taskId" title="Task">
          <Form.Dropdown.Section>
            <Form.Dropdown.Item key={-1} value={"-1"} title={"Without task"} icon={{ source: Icon.BlankDocument }} />
          </Form.Dropdown.Section>

          <Form.Dropdown.Section title="Project tasks">
            {tasks.map((task: Task) => (
              <Form.Dropdown.Item
                key={task.id}
                value={task.id}
                title={task.name}
                icon={{ source: Icon.BlankDocument }}
              />
            ))}
          </Form.Dropdown.Section>
        </Form.Dropdown>
      ) : null}
    </>
  );
}

function TagPicker({ setLoadingIndicator }: { setLoadingIndicator: (isLoading: boolean) => void }) {
  const { config } = useConfig();
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    if (isEmpty(config)) return;

    async function getAllTagsOnWorkspace(): Promise<void> {
      setLoadingIndicator(true);

      const storedTags = await LocalStorage.getItem<string>("tags");
      if (storedTags) setTags(JSON.parse(storedTags));

      const tagsResponse = await fetcher(`/workspaces/${config.workspaceId}/tags?page-size=1000&archived=false`);
      setTags(tagsResponse.data || []);
      LocalStorage.setItem("tags", JSON.stringify(tagsResponse.data));

      setLoadingIndicator(false);
    }

    getAllTagsOnWorkspace();
  }, [config]);

  return (
    <>
      <Form.Separator />
      <Form.TagPicker title="Tags (optional)" id="tagIds" placeholder="Search tags">
        {tags.map((tag) => (
          <Form.TagPicker.Item key={tag.id} title={tag.name} value={tag.id} />
        ))}
      </Form.TagPicker>
    </>
  );
}

function CreateEntry({ latestTimeEntry }: { latestTimeEntry: TimeEntry | undefined }) {
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const format = new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short"
  });

  return (
    <Form
      navigationTitle="Create Time Entry"
      isLoading={isLoading}
    >
      <ProjectDropdown setLoadingIndicator={setLoadingIndicator} />

      <Form.TextField id="description" title="Description" placeholder="What are you working on?" autoFocus />

      <Form.DatePicker 
        id="start" 
        title="Start" 
        info={
          latestTimeEntry 
            ? `Latest entry: ${latestTimeEntry.description} (${format.format(new Date(latestTimeEntry.timeInterval.start))} - ${format.format(new Date(latestTimeEntry.timeInterval.end))})` 
            : undefined
        }
      />

      <Form.DatePicker id="end" title="End" />

      <TagPicker setLoadingIndicator={setLoadingIndicator} />
    </Form>
  );

  function setLoadingIndicator(isLoading: boolean) {
    setIsLoading(isLoading);
  }
}

function NewEntry({ updateTimeEntries }: { updateTimeEntries: () => void }) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { pop } = useNavigation();

  return (
    <Form
      navigationTitle="Start New Timer"
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Start"
            onSubmit={({ description, projectId, taskId, tagIds }) => {
              if (projectId) {
                addNewTimeEntry(description, projectId, taskId === "-1" ? null : taskId, tagIds).then(
                  updateTimeEntries,
                );
                pop();
              } else {
                showToast(Toast.Style.Failure, "Project is required.");
              }
            }}
          />
          <Action.SubmitForm title="Discard" onSubmit={pop} />
        </ActionPanel>
      }
    >
      <ProjectDropdown setLoadingIndicator={setLoadingIndicator} />

      <Form.TextField id="description" title="Description" placeholder="What are you working on?" autoFocus />

      <TagPicker setLoadingIndicator={setLoadingIndicator} />
    </Form>
  );

  function setLoadingIndicator(isLoading: boolean) {
    setIsLoading(isLoading);
  }
}

async function getTimeEntries({ onError }: { onError?: (state: boolean) => void }): Promise<TimeEntry[]> {
  const workspaceId = await LocalStorage.getItem("workspaceId");
  const userId = await LocalStorage.getItem("userId");

  const { data, error } = await fetcher(
    `/workspaces/${workspaceId}/user/${userId}/time-entries?hydrated=true&page-size=500`,
  );

  if (error === "Unauthorized") {
    onError?.(false);
    return [];
  }

  if (data?.length) {
    return data;
  } else {
    return [];
  }
}

async function stopCurrentTimer(): Promise<void> {
  showToast(Toast.Style.Animated, "Stopping…");

  const workspaceId = await LocalStorage.getItem("workspaceId");
  const userId = await LocalStorage.getItem("userId");

  const { data, error } = await fetcher(`/workspaces/${workspaceId}/user/${userId}/time-entries`, {
    method: "PATCH",
    body: { end: new Date().toISOString() },
  });

  if (!error && data) {
    showToast(Toast.Style.Success, "Timer stopped");
  } else {
    showToast(Toast.Style.Failure, "No timer running");
  }
}

async function addNewTimeEntry(
  description: string | undefined | null,
  projectId: string,
  taskId: string | undefined | null,
  tagIds: string[] = [],
): Promise<void> {
  showToast(Toast.Style.Animated, "Starting…");

  const workspaceId = await LocalStorage.getItem("workspaceId");

  const { data } = await fetcher(`/workspaces/${workspaceId}/time-entries`, {
    method: "POST",
    body: {
      description,
      taskId,
      projectId,
      timeInterval: {
        start: new Date().toISOString(),
        end: null,
        duration: null,
      },
      tagIds,
      customFieldValues: [],
    },
  });

  if (data?.id) {
    showToast(Toast.Style.Success, "Timer is running");
  } else {
    showToast(Toast.Style.Failure, "Timer could not be started");
  }
}
