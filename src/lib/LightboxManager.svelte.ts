interface LightboxState {
	src: string;
	alt: string;
}

class Lightbox {
	current = $state<LightboxState | null>(null);

	open(src: string, alt = 'Image') {
		this.current = { src, alt };
	}

	close() {
		this.current = null;
	}
}

export const lightbox = new Lightbox();
