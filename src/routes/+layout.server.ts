export const load = async ({ locals, platform, request }) => { 
    const edgeLocation = platform?.cf.colo;
    const cfRay = request.headers.get('cf-ray');
    return {
        edgeLocation,
        cfRay
    }
};