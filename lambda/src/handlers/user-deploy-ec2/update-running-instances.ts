// TODO: handle region, ebsvolume, and instance type
type UpdateRunningInstancesEvent = {
    instanceId: string
    instanceArn: string
    userId: string
}

type UpdateRunningInstancesResult = {
    success: boolean
    instanceId: string

}

// last modified time clculated here
// handle null values here
// status would always be updated to running here
export const handler = async (event: UpdateRunningInstancesResult) => {

}



