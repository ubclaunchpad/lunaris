export const handler = async () => {

}

type checkRunningInstancesEvent = {
    userId: string
}

type checkRunningInstancesResult = {
    status: string
    instanceId: string
}
