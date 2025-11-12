"use client";

import React, {useEffect, useState} from "react";

import dcv from "dcv";
import { DCVViewer } from "dcv-ui"

type DcvProps = {
    logLevel?: number;
    serverUrl: string;
    baseUrl: string;
};

type AuthHandle = {
    retry: () => void;
};

export default function DcvViewer({
                                      logLevel = dcv.LogLevel.INFO,
                                      serverUrl,
                                      baseUrl,
                                  }: DcvProps) {
    const [authenticated, setAuthenticated] = useState(false)
    const [sessionId, setSessionId] = useState("")
    const [authToken, setAuthToken] = useState("")

    let auth: AuthHandle

    const onSuccess = (_: unknown, result: Array<{ sessionId: string; authToken: string }>) => {
        const first = result[0]
        console.log("Authentication successful.")
        setSessionId(first.sessionId)
        setAuthToken(first.authToken)
        setAuthenticated(true)
    }

    const onError = (_: unknown, error: { message: string }) => {
        console.error("DCV auth error:", error?.message)
    }

    const authenticate = () => {
        dcv.setLogLevel(logLevel)
        auth = dcv.authenticate(
            serverUrl,
            {
                promptCredentials: {},
                error: onError,
                success: onSuccess,
            }
        ) as AuthHandle
    }

    useEffect(() => {
        if (!authenticated) {
            authenticate();
        }
    }, [authenticated]);

    const onDisconnect = (reason: { message: string; code: number }) => {
        console.log(`DCV disconnected: ${reason.message} (code ${reason.code})`)
        auth.retry()
        setAuthenticated(false)
    }

    return (
        <DCVViewer
            dcv={{
                sessionId,
                authToken,
                serverUrl,
                baseUrl,
                onDisconnect,
                logLevel,
            }}
            uiConfig={{
                toolbar: {
                    visible: true,
                    fullscreenButton: true,
                    multimonitorButton: true
                },
            }}
        />
    )
}
