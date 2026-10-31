import { useEffect, useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifyError, notifySuccess } from '../../lib/notify';
import * as api from './api';

const KEY = (endpoint: string) => ['screenshots', endpoint] as const;

export function useScreenshots(endpoint: string, enabled = true) {
    return useQuery({ queryKey: KEY(endpoint), queryFn: () => api.fetchScreenshots(endpoint), enabled });
}

export function useTakeScreenshot(endpoint: string) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: () => api.takeScreenshot(endpoint),
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: KEY(endpoint) });
            notifySuccess('Screenshot kept');
        },
        onError: notifyError,
    });
}

/**
 * The images of some screenshots as addresses an <img> can show (released when they are no longer used). One entry per
 * id, in the same order; null while an image loads.
 */
export function useScreenshotImages(endpoint: string, ids: number[]) {
    const results = useQueries({
        queries: ids.map((id) => ({
            queryKey: [...KEY(endpoint), 'image', id],
            queryFn: () => api.fetchScreenshotImage(endpoint, id),
            staleTime: Infinity, // a screenshot never changes once kept
        })),
    });
    // The addresses are made again only when an image arrives (its query updates), not on every render
    const arrived = results.map((r) => r.dataUpdatedAt).join(',');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `arrived` stands for the data of the queries
    const urls = useMemo(() => results.map((r) => (r.data ? URL.createObjectURL(r.data) : null)), [arrived]);
    useEffect(() => () => urls.forEach((url) => url && URL.revokeObjectURL(url)), [urls]);
    return urls;
}
