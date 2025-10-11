// /cdk/lambda/deployInstance.ts
export const handler = async (event: any) => {
    const body = JSON.parse(event.body || {})
    const userId = body.userId
    return {
        statusCode: 200,
        body: JSON.stringify({message: "hello! this is the deployInstance handler"})
    };
};
