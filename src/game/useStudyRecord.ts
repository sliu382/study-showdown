import { useEffect, useState } from 'react'
import { studyRequest } from './study-client'

export function useStudyRecord<T>(path: string) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ data?: T; error?: string }>({})

  useEffect(() => {
    const controller = new AbortController()
    setState({})
    studyRequest<T>(path, { signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setState({ data }) },
      (error) => { if (!controller.signal.aborted) setState({ error: error.message || 'Could not load your study records.' }) },
    )
    return () => controller.abort()
  }, [path, revision])

  return { ...state, retry: () => setRevision((value) => value + 1) }
}
