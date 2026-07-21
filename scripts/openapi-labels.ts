const serviceTag = /^( {8}- | {2}- name: )([A-Za-z][A-Za-z0-9]*)Service$/gmu;

export const shortenServiceTags = (source: string): string =>
	source.replace(serviceTag, "$1$2");
