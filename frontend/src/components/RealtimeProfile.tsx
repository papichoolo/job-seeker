'use client';
import { useState, useRef, useEffect } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ProfileData {
    skills: string[];
    experience_years: number;
    location_pref: string;
    summary: string;
}

export default function RealtimeProfile() {
    const [logs, setLogs] = useState<string>(""); // For "Thinking" logs
    const [jsonOutput, setJsonOutput] = useState<string>(""); // Raw streaming output
    const [parsedProfile, setParsedProfile] = useState<ProfileData | null>(null); // Parsed JSON
    const [status, setStatus] = useState("idle");

    // Refs for auto-scroll
    const logsRef = useRef<HTMLDivElement>(null);
    const jsonRef = useRef<HTMLDivElement>(null);

    // Auto-scroll when content updates
    useEffect(() => {
        if (logsRef.current) {
            logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }
    }, [logs]);

    useEffect(() => {
        if (jsonRef.current) {
            jsonRef.current.scrollTop = jsonRef.current.scrollHeight;
        }
    }, [jsonOutput]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        const file = e.target.files[0];
        setLogs("");
        setJsonOutput("");
        setParsedProfile(null);
        setStatus("uploading");

        // 1. Upload the File
        const formData = new FormData();
        formData.append("file", file);

        try {
            const uploadRes = await fetch(`${API_BASE_URL}/upload`, {
                method: "POST",
                body: formData,
            });
            const { session_id } = await uploadRes.json();

            // 2. Open the Stream
            setStatus("processing");
            const eventSource = new EventSource(`${API_BASE_URL}/stream/${session_id}`);

            eventSource.onmessage = (event) => {
                if (event.data === "[DONE]") {
                    eventSource.close();
                    setStatus("complete");
                    return;
                }

                const parsed = JSON.parse(event.data);

                if (parsed.type === "thought") {
                    setLogs((prev) => prev + parsed.chunk);
                } else if (parsed.type === "content") {
                    setJsonOutput((prev) => prev + parsed.chunk);
                } else if (parsed.type === "final") {
                    // Final parsed JSON - store structured data
                    const finalData = parsed.data || parsed.raw;
                    if (typeof finalData === 'object') {
                        setParsedProfile(finalData as ProfileData);
                    }
                    setJsonOutput(JSON.stringify(finalData, null, 2));
                } else if (parsed.type === "error") {
                    setStatus("error");
                    setJsonOutput(parsed.message);
                    console.error("SSE Error:", parsed.message);
                }
            };

            eventSource.onerror = () => {
                eventSource.close();
                setStatus("error");
            };
        } catch (err) {
            setStatus("error");
            console.error(err);
        }
    };

    return (
        <div className="p-4 grid grid-cols-2 gap-4">
            {/* Upload */}
            <div className="col-span-2 flex items-center gap-4">
                <input
                    type="file"
                    accept=".pdf"
                    onChange={handleUpload}
                    className="file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-neutral-700 file:text-white hover:file:bg-neutral-600"
                />
                <span className={`px-3 py-1 rounded text-sm font-medium ${status === 'idle' ? 'bg-neutral-700 text-neutral-300' :
                    status === 'uploading' ? 'bg-yellow-600 text-white' :
                        status === 'processing' ? 'bg-blue-600 text-white animate-pulse' :
                            status === 'complete' ? 'bg-green-600 text-white' :
                                'bg-red-600 text-white'
                    }`}>
                    {status}
                </span>
            </div>

            {/* Left Panel: The Brain (Thinking) */}
            <div
                ref={logsRef}
                className="bg-neutral-900 text-green-400 p-4 rounded font-mono text-sm h-96 overflow-auto border border-neutral-700"
            >
                <h3 className="text-neutral-300 border-b border-neutral-700 mb-2 pb-2 font-semibold">
                    🧠 LLM Thinking Process...
                </h3>
                <pre className="whitespace-pre-wrap">{logs || <span className="text-neutral-500 italic">No thinking output from this model</span>}</pre>
            </div>

            {/* Right Panel: Structured Profile Card OR Raw JSON */}
            <div
                ref={jsonRef}
                className="bg-neutral-800 text-neutral-100 p-4 rounded h-96 overflow-auto border border-neutral-700"
            >
                <h3 className="text-neutral-300 border-b border-neutral-700 mb-4 pb-2 font-semibold">
                    📋 Extracted Profile
                </h3>

                {parsedProfile ? (
                    // Fancy Card Layout when we have parsed JSON
                    <div className="space-y-4">
                        {/* Skills */}
                        <div>
                            <label className="text-xs uppercase text-neutral-400 font-semibold">Skills</label>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {parsedProfile.skills?.map((skill, i) => (
                                    <span key={i} className="px-2 py-1 bg-blue-600/30 text-blue-300 rounded text-sm border border-blue-500/50">
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Experience & Location */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-neutral-700/50 rounded p-3">
                                <label className="text-xs uppercase text-neutral-400 font-semibold">Experience</label>
                                <p className="text-2xl font-bold text-green-400 mt-1">
                                    {parsedProfile.experience_years} <span className="text-sm font-normal text-neutral-400">years</span>
                                </p>
                            </div>
                            <div className="bg-neutral-700/50 rounded p-3">
                                <label className="text-xs uppercase text-neutral-400 font-semibold">Location</label>
                                <p className="text-lg font-semibold text-white mt-1">
                                    📍 {parsedProfile.location_pref}
                                </p>
                            </div>
                        </div>

                        {/* Summary */}
                        <div>
                            <label className="text-xs uppercase text-neutral-400 font-semibold">Summary</label>
                            <p className="text-neutral-200 mt-1 leading-relaxed">
                                {parsedProfile.summary}
                            </p>
                        </div>

                        {/* JSON verified badge */}
                        <div className="pt-4 border-t border-neutral-700">
                            <span className="text-xs bg-green-600/30 text-green-400 px-2 py-1 rounded">
                                ✓ Valid JSON Structure Received
                            </span>
                        </div>
                    </div>
                ) : (
                    // Raw JSON output while streaming
                    <pre className="text-sm whitespace-pre-wrap text-green-300">
                        {jsonOutput || <span className="text-neutral-500 italic">Waiting for response...</span>}
                    </pre>
                )}
            </div>
        </div>
    );
}


