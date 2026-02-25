type ResumeDeployInstanceEvent = {
    instanceId: string
}

type ResumeDeployInstanceResult = {
    instanceId: string
    status: string
    success: boolean
}

export const handler = async (event: ResumeDeployInstanceEvent) => {

}
