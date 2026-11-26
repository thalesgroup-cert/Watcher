import { api } from '../../api/client';

/** A screenshot kept for an object of any module (`/api/<module>/<kind>/<id>/screenshots/`). */
export interface Screenshot {
    id: number;
    url: string;
    size: number;
    created_at: string;
    taken_by: string | null;
}

export interface ScreenshotList {
    /** The screenshot service is set up on this instance. */
    configured: boolean;
    results: Screenshot[];
}

/** `endpoint` is the address of the object, with its trailing slash: `/api/data_leak/alert/12/`. */
export const fetchScreenshots = (endpoint: string) => api.get<ScreenshotList>(`${endpoint}screenshots/`).then((res) => res.data);

export const takeScreenshot = (endpoint: string) => api.post<Screenshot>(`${endpoint}screenshots/capture/`).then((res) => res.data);

/** The image: the API wants the token in a header, which an <img> cannot send, so it is fetched here. */
export const fetchScreenshotImage = (endpoint: string, id: number) =>
    api.get<Blob>(`${endpoint}screenshots/${id}/image/`, { responseType: 'blob' }).then((res) => res.data);
