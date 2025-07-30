export const formatJson = (obj: any): string => {
    return JSON.stringify(obj, null, 2);
}