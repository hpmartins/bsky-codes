<script lang="ts">
    import wolfgang from '$lib/assets/wolfgang.jpg';
    export let items : {
        href: string,
        text: string;
    }[];
</script>

<nav
	class="navbar navbar-expand-lg mb-3"
	style="background-color: #e6c219; border-bottom: 5px solid #405be3;"
>
	<div class="container">
		<a class="navbar-brand" href="/">
			<img
				src={wolfgang}
				alt="Logo"
				width="32"
				height="32"
				style="border-radius: 33%;"
				class="d-inline-block align-text-middle me-2"
			/>
			Wolfgang
		</a>
		<button
			class="navbar-toggler"
			type="button"
			data-bs-toggle="collapse"
			data-bs-target="#navbarNav"
			aria-controls="navbarNav"
			aria-expanded="false"
			aria-label="Toggle navigation"
		>
			<span class="navbar-toggler-icon" />
		</button>
		<div class="collapse navbar-collapse" id="navbarNav">
			<ul class="navbar-nav ml-auto">
                {#each items as item}
				<li class="nav-item">
					<a class="nav-link" href={item.href}>{item.text}</a>
				</li>
                {/each}
			</ul>
		</div>
	</div>
</nav>
